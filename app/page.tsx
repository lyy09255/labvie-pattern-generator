"use client";

import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createProject, renderPattern, renderPlaidField, type DotShape } from "./pattern-engine";

type PatternType = "plaid" | "stripe" | "dot" | "knit";
type BackgroundBlendMode = "screen" | "multiply" | "soft-light";
type BackgroundTextureKind = "linen" | "denim" | "stripe" | "knitted";
type StripeDirection = "vertical" | "horizontal" | "diagonal";
type PreviewRatio = "1:1" | "3:2" | "2:3" | "4:3" | "3:4" | "16:9" | "9:16";
type ControlBand = { id:number;width:number;color:string;opacity:number;offset?:number };
type StripeConfig = {
  spacing:number;width:number;secondaryWidth:number;secondaryEnabled:boolean;secondaryOffset:number;
  accentWidth:number;accentEnabled:boolean;accentOffset:number;colors:string[];colorOpacities:number[];
  extraSecondary:ControlBand[];extraAccent:ControlBand[];
};
type DotConfig = {
  shape:DotShape;size:number;starPoints:number;gapX:number;gapY:number;rowOffset:number;
  colors:string[];colorOpacities:number[];
};
type DesignSnapshot = {
  type:PatternType;spacing:number;width:number;secondaryWidth:number;accentWidth:number;
  secondaryEnabled:boolean;accentEnabled?:boolean;secondaryOffset:number;accentOffset:number;
  stripeDirection:StripeDirection;dotSize:number;colors:string[];colorOpacities:number[];
  backgroundColor?:string;backgroundColorOpacity?:number;backgroundBlendMode?:BackgroundBlendMode;backgroundTextureKind?:BackgroundTextureKind;
  extraMain:ControlBand[];extraSecondary:ControlBand[];extraAccent:ControlBand[];
  stripeConfig:StripeConfig;dotConfig:DotConfig;
};
type SavedDesign = {id:string;name:string;type:PatternType;snapshot:string;preview:string;createdAt:number;customDotSource?:string;customDotName?:string};
type LibraryFilter = PatternType|"all";
const libraryStorageKey="labvie-pattern-library-v1";
const backgroundTextures:{id:BackgroundTextureKind;label:string;image:string;tag:string}[]=[
  {id:"linen",label:"亚麻",image:"/yama.png?v=20260818",tag:"LINEN"},
  {id:"denim",label:"牛仔",image:"/niuzai.png?v=20260818",tag:"DENIM"},
  {id:"stripe",label:"条纹",image:"/tiaowen.png?v=20260818",tag:"STRIPE"},
  {id:"knitted",label:"针织",image:"/zhenzhi.png?v=20260818",tag:"KNITTED"},
];

const dotShapes:{id:DotShape;label:string}[]=[
  {id:"circle",label:"圆点"},
  {id:"star",label:"星星"},
  {id:"heart",label:"爱心"},
  {id:"drop",label:"水滴"},
];

const types: { id: PatternType; label: string; desc: string; glyph: string }[] = [
  { id: "plaid", label: "格纹", desc: "Plaid Pattern", glyph: "▦" },
  { id: "stripe", label: "条纹", desc: "Striped Pattern", glyph: "╱" },
  { id: "dot", label: "波点", desc: "Dot Pattern", glyph: "●" },
  { id: "knit", label: "背景底纹", desc: "Background Texture", glyph: "≋" },
];
const previewRatios:PreviewRatio[]=["1:1","3:2","2:3","4:3","3:4","16:9","9:16"];
const initialPlaidColors=["#FBF4F0","#D8A796","#EBCBC1","#B9857A"];
const initialPlaidAccentBands:ControlBand[]=[];
function ratioValue(ratio:PreviewRatio){const [width,height]=ratio.split(":").map(Number);return width/height}

function normalizeHex(raw:string){const value=raw.trim().toUpperCase();if(/^#[0-9A-F]{6}$/.test(value))return value;if(/^#[0-9A-F]{3}$/.test(value))return `#${[...value.slice(1)].map(x=>x+x).join("")}`;return null}

function hexToRgb(hex:string){const safe=normalizeHex(hex)||"#FFFFFF";const raw=safe.slice(1);return{r:parseInt(raw.slice(0,2),16),g:parseInt(raw.slice(2,4),16),b:parseInt(raw.slice(4,6),16)}}
function rgbToHex(r:number,g:number,b:number){return`#${[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("").toUpperCase()}`}
function rgbToHsv(r:number,g:number,b:number){const rn=r/255,gn=g/255,bn=b/255,max=Math.max(rn,gn,bn),min=Math.min(rn,gn,bn),d=max-min;let h=0;if(d){if(max===rn)h=((gn-bn)/d)%6;else if(max===gn)h=(bn-rn)/d+2;else h=(rn-gn)/d+4;h*=60;if(h<0)h+=360}const s=max===0?0:d/max;return{h,s,v:max}}
function hsvToRgb(h:number,s:number,v:number){const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;let r=0,g=0,b=0;if(h<60)[r,g,b]=[c,x,0];else if(h<120)[r,g,b]=[x,c,0];else if(h<180)[r,g,b]=[0,c,x];else if(h<240)[r,g,b]=[0,x,c];else if(h<300)[r,g,b]=[x,0,c];else[r,g,b]=[c,0,x];return{r:(r+m)*255,g:(g+m)*255,b:(b+m)*255}}
function colorLightness(hex:string){const {r,g,b}=hexToRgb(hex);return(r*.299+g*.587+b*.114)/255}
function mixColor(a:string,b:string,amount:number){const x=hexToRgb(a),y=hexToRgb(b);return rgbToHex(x.r+(y.r-x.r)*amount,x.g+(y.g-x.g)*amount,x.b+(y.b-x.b)*amount)}
function drawColoredTexture(source:HTMLImageElement,width:number,height:number,color:string,colorOpacity:number,blendMode:BackgroundBlendMode){
  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d")!;
  const sourceRatio=source.naturalWidth/source.naturalHeight,targetRatio=width/height;
  let sx=0,sy=0,sw=source.naturalWidth,sh=source.naturalHeight;
  if(sourceRatio>targetRatio){sw=source.naturalHeight*targetRatio;sx=(source.naturalWidth-sw)/2}
  else{sh=source.naturalWidth/targetRatio;sy=(source.naturalHeight-sh)/2}
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  ctx.drawImage(source,sx,sy,sw,sh,0,0,width,height);
  ctx.save();
  ctx.globalAlpha=Math.max(0,Math.min(100,colorOpacity))/100;
  ctx.globalCompositeOperation=blendMode;
  ctx.fillStyle=color;
  ctx.fillRect(0,0,width,height);
  ctx.restore();
  return canvas;
}
function shuffle<T>(items:T[]){const next=[...items];for(let i=next.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[next[i],next[j]]=[next[j],next[i]]}return next}
function colorDistance(a:string,b:string){
  const x=hexToRgb(a),y=hexToRgb(b);
  return Math.hypot(x.r-y.r,x.g-y.g,x.b-y.b);
}
function randomizedImagePalette(source:string[]){
  const originals=[...new Set(source.map(normalizeHex).filter((color):color is string=>!!color))];
  if(originals.length<2)return originals;
  const byLightness=[...originals].sort((a,b)=>colorLightness(a)-colorLightness(b));
  const third=Math.max(1,Math.ceil(byLightness.length/3));
  const dark=byLightness.slice(0,third);
  const middle=byLightness.slice(third,Math.max(third+1,byLightness.length-third));
  const light=byLightness.slice(-third);
  const pick=<T,>(items:T[])=>items[Math.floor(Math.random()*items.length)];
  // Alternate between light, dark and mid-tone foundations. Previously every
  // result forced the lightest colour into the background and the darkest into
  // the main band, so shuffling could barely change the overall impression.
  const foundationMode=Math.floor(Math.random()*3);
  const background=pick(foundationMode===0?light:foundationMode===1?dark:(middle.length?middle:byLightness));
  const mainCandidates=originals
    .filter(color=>color!==background)
    .map(color=>({color,score:colorDistance(color,background)*(0.8+Math.random()*.4)}))
    .sort((a,b)=>b.score-a.score);
  const main=pick(mainCandidates.slice(0,Math.min(3,mainCandidates.length))).color;
  const remaining=originals
    .filter(color=>color!==background&&color!==main)
    .map(color=>({color,score:Math.min(colorDistance(color,background),colorDistance(color,main))*(0.72+Math.random()*.56)}))
    .sort((a,b)=>b.score-a.score)
    .map(item=>item.color);
  const derived=[
    mixColor(background,main,.28),
    mixColor(background,main,.58),
    mixColor(background,main,.78),
  ];
  const accents=shuffle([...remaining,...derived]).filter((color,index,items)=>items.indexOf(color)===index);
  return[background,main,...accents].slice(0,5);
}
function extractDiversePalette(data:Uint8ClampedArray,limit=5){
  type Bucket={r:number;g:number;b:number;count:number};
  type Candidate={r:number;g:number;b:number;count:number;h:number;s:number;v:number};
  const buckets=new Map<string,Bucket>();
  const step=16;
  let sampled=0;
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]<180)continue;
    sampled++;
    const r=data[i],g=data[i+1],b=data[i+2];
    const key=`${Math.round(r/step)},${Math.round(g/step)},${Math.round(b/step)}`;
    const bucket=buckets.get(key);
    if(bucket){bucket.r+=r;bucket.g+=g;bucket.b+=b;bucket.count++}
    else buckets.set(key,{r,g,b,count:1});
  }
  const candidates=[...buckets.values()]
    .filter(x=>x.count>=Math.max(2,sampled*.00035))
    .map(x=>{
      const r=x.r/x.count,g=x.g/x.count,b=x.b/x.count;
      return{r,g,b,count:x.count,...rgbToHsv(r,g,b)}
    })
    .sort((a,b)=>b.count-a.count)
    .slice(0,240);
  if(!candidates.length)return[];
  const maxCount=candidates[0].count;
  const distance=(a:Candidate,b:Candidate)=>{
    const rgb=Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b)/441.7;
    const hue=Math.min(Math.abs(a.h-b.h),360-Math.abs(a.h-b.h))/180;
    const value=Math.abs(a.v-b.v);
    return rgb*.46+hue*Math.min(a.s,b.s)*.42+value*.12;
  };

  const chosen:Candidate[]=[];
  const add=(candidate:Candidate|null)=>{if(candidate&&!chosen.includes(candidate))chosen.push(candidate)};
  const neutralPresence=Math.max(2,sampled*.00035);
  const bestNeutral=(pool:Candidate[],targetValue:number)=>pool
    .filter(x=>x.count>=neutralPresence)
    .sort((a,b)=>{
      const score=(x:Candidate)=>Math.pow(x.count/maxCount,.16)*.18+(1-Math.abs(x.v-targetValue))*.62+(1-x.s)*.2;
      return score(b)-score(a);
    })[0]||null;

  // Black and white carry structural information in product photos. Treat them
  // independently so several background browns cannot crowd them out.
  add(bestNeutral(candidates.filter(x=>x.v<=.32&&x.s<=.38),0));
  add(bestNeutral(candidates.filter(x=>x.v>=.78&&x.s<=.24),1));

  const chromatic=candidates.filter(x=>x.s>=.22&&x.v>=.18&&x.v<=.96);
  while(chosen.length<limit&&chromatic.length){
    let best:Candidate|null=null,bestScore=-1;
    for(const candidate of chromatic){
      if(chosen.includes(candidate))continue;
      const hueDistance=chosen.length
        ?Math.min(...chosen.map(color=>distance(candidate,color)))
        :1;
      // Coverage is deliberately weak. Vivid, distinct accents remain eligible
      // even when they occupy only a small product detail.
      const coverage=Math.pow(candidate.count/maxCount,.16);
      const usableValue=1-Math.min(1,Math.abs(candidate.v-.58)/.58);
      const score=hueDistance*.58+candidate.s*.25+coverage*.12+usableValue*.05;
      if(score>bestScore){best=candidate;bestScore=score}
    }
    if(!best)break;
    add(best);
  }

  // Fill any remaining slots from the complete candidate set while continuing
  // to favour perceptual difference over raw pixel frequency.
  while(chosen.length<Math.min(limit,candidates.length)){
    let best:Candidate|null=null,bestScore=-1;
    for(const candidate of candidates){
      if(chosen.includes(candidate))continue;
      const minDistance=Math.min(...chosen.map(color=>distance(candidate,color)));
      const score=minDistance*.84+Math.pow(candidate.count/maxCount,.16)*.16;
      if(score>bestScore){best=candidate;bestScore=score}
    }
    if(!best)break;
    add(best);
  }
  return chosen.slice(0,limit).map(color=>rgbToHex(color.r,color.g,color.b));
}

const curatedPlaidPalettes=[
  ["#252940","#8C2515","#D3421D","#F4C24E"],
  ["#B8D7EC","#9D4B32","#F4F4F1","#596B7C"],
  ["#EDC092","#B9542C","#FFF0D1","#4B3530"],
  ["#221E1B","#8F2A22","#C87755","#F0E5DE"],
  ["#F5F1EE","#9B8790","#B596BD","#287C79","#E8A08F"],
  ["#FFFDF4","#E8B845","#7D9CB7","#866A91"],
  ["#F5D3DC","#A98572","#FFF9E9","#D981A5"],
  ["#F3ECDD","#33445F","#9A3435","#C7B392"],
  ["#E9E0C8","#244D3E","#B52018","#C89D54"],
  ["#EFE8D9","#4A2723","#AD241B","#D3A760"],
  ["#F4F0E8","#415268","#B8A985","#7F3F42"],
  ["#243B43","#D7C699","#8A3336","#EEE8D8"],
  // Fresh, airy checks inspired by the supplied reference sheet.
  ["#F7F8F2","#A9C957","#DCE8C6","#8C9686","#FFFFFF"],
  ["#F5F4EF","#B6D65D","#A9A29D","#D8E6BF","#FFFFFF"],
  ["#F7F8F5","#8FBE48","#C9DFA1","#AFC9A6","#FFFFFF"],
  ["#FBF4F0","#D8A796","#EBCBC1","#B9857A","#FFFDFC"],
  ["#F6F4F1","#55463F","#A49B95","#D7D3CF","#FFFFFF"],
  ["#FBF8EE","#8A603B","#F4CE67","#DAB170","#FFFFFF"],
  ["#F8FAFD","#87B9DE","#C7D9EF","#AAA5AD","#FFFFFF"],
  ["#FFFDF5","#9EC9EE","#F4D85A","#DDEBFA","#FFFFFF"],
  ["#FBF1F5","#D6A0B9","#EAC7D8","#B77E9B","#FFFFFF"],
  ["#F6ECEB","#3F2525","#754344","#CFA8A7","#FFFFFF"],
  ["#F6F3EA","#746E59","#B4AB91","#D6C79E","#FFFFFF"],
  ["#D5E9F7","#5CA4D1","#8E9AA6","#F5F8FA","#FFFFFF"],
  ["#D5E0E5","#948777","#B7A895","#7590A0","#F6F5F1"],
  ["#ECECF2","#777680","#A4A3AD","#E2B55E","#FFFFFF"],
  ["#F4F7FC","#6D93D0","#AFC8EC","#E7B35C","#FFFFFF"],
];

function ColorField({label,value,onChange,opacity=100,onOpacityChange}:{label:string;value:string;onChange:(value:string)=>void;opacity?:number;onOpacityChange?:(value:number)=>void}){
  const safeValue=normalizeHex(value)||"#FFFFFF";
  const [draft,setDraft]=useState(safeValue);
  const [editing,setEditing]=useState(false);
  const [open,setOpen]=useState(false);
  const rootRef=useRef<HTMLSpanElement>(null);
  const rgb=useMemo(()=>hexToRgb(safeValue),[safeValue]);
  const hsv=useMemo(()=>rgbToHsv(rgb.r,rgb.g,rgb.b),[rgb]);
  useEffect(()=>{
    if(!open)return;
    const handle=(event:MouseEvent)=>{
      if(rootRef.current && !rootRef.current.contains(event.target as Node))setOpen(false);
    };
    document.addEventListener("mousedown",handle);
    return()=>document.removeEventListener("mousedown",handle);
  },[open]);
  const commit=(raw:string)=>{const next=normalizeHex(raw);if(next){setDraft(next);onChange(next)}else setDraft(safeValue)};
  const setFromPanel=(next:string)=>{const valid=normalizeHex(next);if(valid){setDraft(valid);onChange(valid)}};
  const updatePlane=(event:React.PointerEvent<HTMLDivElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    const s=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
    const v=Math.max(0,Math.min(1,1-(event.clientY-rect.top)/rect.height));
    const rgb=hsvToRgb(hsv.h,s,v);
    setFromPanel(rgbToHex(rgb.r,rgb.g,rgb.b));
  };
  const beginPlaneDrag=(event:React.PointerEvent<HTMLDivElement>)=>{
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePlane(event);
  };
  const updateHue=(event:React.PointerEvent<HTMLDivElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    const h=Math.max(0,Math.min(359,((event.clientX-rect.left)/rect.width)*359));
    const rgb=hsvToRgb(h,Math.max(hsv.s,.01),hsv.v);
    setFromPanel(rgbToHex(rgb.r,rgb.g,rgb.b));
  };
  const beginHueDrag=(event:React.PointerEvent<HTMLDivElement>)=>{
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateHue(event);
  };
  const pickerX=`${hsv.s*100}%`,pickerY=`${(1-hsv.v)*100}%`,hueX=`${(hsv.h/359)*100}%`;
  return <span className="colorField" ref={rootRef}><input className="hexInput" aria-label={`${label}色值`} value={editing?draft:safeValue} maxLength={7} spellCheck={false} onFocus={()=>{setDraft(safeValue);setEditing(true)}} onClick={event=>event.stopPropagation()} onChange={e=>{const raw=e.target.value.toUpperCase();setDraft(raw);if(/^#[0-9A-F]{6}$/.test(raw))onChange(raw)}} onBlur={e=>{setEditing(false);commit(e.target.value)}} onKeyDown={e=>{if(e.key==="Enter"){commit(e.currentTarget.value);e.currentTarget.blur()}else if(e.key==="Escape"){setDraft(safeValue);e.currentTarget.blur()}}}/><button type="button" className="colorSwatch" aria-label={`${label}取色器`} aria-expanded={open} style={{backgroundColor:safeValue,opacity:Math.max(.08,opacity/100)}} onClick={event=>{event.stopPropagation();setOpen(v=>!v)}}/>{open&&<span className="colorPopover" onPointerDown={event=>event.stopPropagation()}><b>{label}</b><div className="colorPlane" style={{backgroundColor:`hsl(${hsv.h} 100% 50%)`}} onPointerDown={beginPlaneDrag} onPointerMove={event=>event.currentTarget.hasPointerCapture(event.pointerId)&&updatePlane(event)}><i style={{left:pickerX,top:pickerY}}/></div><div className="hueSlider" onPointerDown={beginHueDrag} onPointerMove={event=>event.currentTarget.hasPointerCapture(event.pointerId)&&updateHue(event)}><i style={{left:hueX}}/></div>{onOpacityChange&&<label className="alphaControl"><span>透明度</span><output>{opacity}%</output><input aria-label={`${label}透明度`} type="range" min={0} max={100} value={opacity} onChange={e=>onOpacityChange(Number(e.target.value))}/></label>}</span>}</span>
}

function Slider({ label, value, min, max, unit, onChange, color, colorOpacity, onColorChange, onColorOpacityChange, onAdd, onRemove }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void; color?:string;colorOpacity?:number; onColorChange?:(v:string)=>void;onColorOpacityChange?:(v:number)=>void; onAdd?:()=>void;onRemove?:()=>void }) {
  const safeValue=Math.max(min,Math.min(max,value));
  const p = ((safeValue - min) / (max - min)) * 100;
  const set=(raw:string)=>{if(raw!=="")onChange(Math.max(min,Math.min(max,Number(raw))))};
  return <div className="sliderRow"><span className="sliderLabel"><span>{label}</span><span className="bandActions">{color&&onColorChange&&<ColorField label={label} value={color} opacity={colorOpacity} onChange={onColorChange} onOpacityChange={onColorOpacityChange}/>} {onAdd&&<button type="button" aria-label={`增加${label}`} onClick={onAdd}>＋</button>}{onRemove&&<button type="button" className="removeBand" aria-label={`删除${label}`} onClick={onRemove}>−</button>}</span></span><div className="sliderLine"><input aria-label={`${label}滑杆`} type="range" min={min} max={max} value={safeValue} onChange={e => onChange(Number(e.target.value))} style={{ "--p": `${p}%` } as React.CSSProperties}/><span className="numberField"><input aria-label={`${label}数值`} type="number" min={min} max={max} value={safeValue} onChange={e=>set(e.target.value)}/><em>{unit.trim()}</em></span></div></div>;
}

function FineLineControl({label,width,offset,widthMin=4,widthMax=36,offsetMin=-150,offsetMax=150,offsetLabel="偏移",color,colorOpacity,onWidthChange,onOffsetChange,onColorChange,onColorOpacityChange,onAdd,onRemove}:{label:string;width:number;offset:number;widthMin?:number;widthMax?:number;offsetMin?:number;offsetMax?:number;offsetLabel?:string;color:string;colorOpacity:number;onWidthChange:(value:number)=>void;onOffsetChange:(value:number)=>void;onColorChange:(value:string)=>void;onColorOpacityChange:(value:number)=>void;onAdd?:()=>void;onRemove?:()=>void}){
  const line=(caption:string,value:number,min:number,max:number,onChange:(value:number)=>void)=>{
    const safe=Math.max(min,Math.min(max,value));
    const p=((safe-min)/(max-min))*100;
    return <div className="sliderLine fineLineSetting"><small>{caption}</small><input aria-label={`${label}${caption}滑杆`} type="range" min={min} max={max} value={safe} onChange={event=>onChange(Number(event.target.value))} style={{"--p":`${p}%`} as React.CSSProperties}/><span className="numberField"><input aria-label={`${label}${caption}数值`} type="number" min={min} max={max} value={safe} onChange={event=>event.target.value!==""&&onChange(Math.max(min,Math.min(max,Number(event.target.value))))}/><em>px</em></span></div>
  };
  return <div className="sliderRow fineLineControl"><span className="sliderLabel"><span>{label}</span><span className="bandActions"><ColorField label={label} value={color} opacity={colorOpacity} onChange={onColorChange} onOpacityChange={onColorOpacityChange}/>{onAdd&&<button type="button" aria-label={`增加${label}`} onClick={onAdd}>＋</button>}{onRemove&&<button type="button" className="removeBand" aria-label={`删除${label}`} onClick={onRemove}>−</button>}</span></span>{line("粗细",width,widthMin,widthMax,onWidthChange)}{line(offsetLabel,offset,offsetMin,offsetMax,onOffsetChange)}</div>
}

export default function Home() {
  const [view,setView]=useState<"home"|"editor"|"library">("home");
  const [type, setType] = useState<PatternType>("plaid");
  const [spacing, setSpacing] = useState(201);
  const [width, setWidth] = useState(50);
  const [secondaryWidth, setSecondaryWidth] = useState(14);
  const [secondaryEnabled,setSecondaryEnabled]=useState(true);
  const [secondaryOffset,setSecondaryOffset]=useState(14);
  const [accentWidth, setAccentWidth] = useState(23);
  const [accentOffset,setAccentOffset]=useState(80);
  const [accentEnabled,setAccentEnabled]=useState(true);
  const [stripeDirection, setStripeDirection] = useState<StripeDirection>("vertical");
  const opacity = 100;
  const [dotSize, setDotSize] = useState(9);
  const texture = "twill" as const;
  const [colors, setColors] = useState([...initialPlaidColors]);
  const [colorOpacities,setColorOpacities]=useState([100,100,100,100]);
  const [extraMain,setExtraMain]=useState<ControlBand[]>([]);
  const [extraSecondary,setExtraSecondary]=useState<ControlBand[]>([]);
  const [extraAccent,setExtraAccent]=useState<ControlBand[]>(()=>initialPlaidAccentBands.map(band=>({...band})));
  const [stripeConfig,setStripeConfig]=useState<StripeConfig>({
    spacing:133,width:20,secondaryWidth:14,secondaryEnabled:true,secondaryOffset:0,
    accentWidth:6,accentEnabled:true,accentOffset:-20,
    colors:["#FFEEEE","#8C5A48","#FFFFFF","#FFD4D4"],colorOpacities:[100,100,100,100],
    extraSecondary:[],extraAccent:[],
  });
  const [dotConfig,setDotConfig]=useState<DotConfig>({
    shape:"circle",size:18,starPoints:5,gapX:188,gapY:93,rowOffset:105,
    colors:["#5C2C0D","#F6C8C4","#FFFFFF"],colorOpacities:[100,100,100],
  });
  const [backgroundColor,setBackgroundColor]=useState("#FF6464");
  const [backgroundColorOpacity,setBackgroundColorOpacity]=useState(100);
  const [backgroundBlendMode,setBackgroundBlendMode]=useState<BackgroundBlendMode>("screen");
  const [backgroundTextureKind,setBackgroundTextureKind]=useState<BackgroundTextureKind>("denim");
  const backgroundImageRef=useRef<HTMLImageElement|null>(null);
  const [backgroundImageRevision,setBackgroundImageRevision]=useState(0);
  const [customDotName,setCustomDotName]=useState("");
  const [customDotSource,setCustomDotSource]=useState<string|null>(null);
  const [customDotImage,setCustomDotImage]=useState<HTMLImageElement|null>(null);
  const customDotFileRef=useRef<HTMLInputElement>(null);
  const [zoom, setZoom] = useState(100);
  const [previewRatio,setPreviewRatio]=useState<PreviewRatio>("3:2");
  const [saved, setSaved] = useState(false);
  const [savedDesigns,setSavedDesigns]=useState<SavedDesign[]>(()=>{
    if(typeof window==="undefined")return [];
    try{return JSON.parse(window.localStorage.getItem(libraryStorageKey)||"[]") as SavedDesign[]}
    catch{return []}
  });
  const [libraryFilter,setLibraryFilter]=useState<LibraryFilter>("all");
  const [libraryNotice,setLibraryNotice]=useState(false);
  const [projectName, setProjectName] = useState("未命名图案");
  const [importPreview,setImportPreview]=useState<string|null>(null);
  const [importPalette,setImportPalette]=useState<string[]>([]);
  const [isImportDragging,setIsImportDragging]=useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef=useRef<string[]>([]);
  const historyIndexRef=useRef(-1);
  const restoringHistoryRef=useRef(false);
  const [historyAvailability,setHistoryAvailability]=useState({canUndo:false,canRedo:false});
  const designSnapshot=useMemo<DesignSnapshot>(()=>({
    type,spacing,width,secondaryWidth,secondaryEnabled,secondaryOffset,accentWidth,accentOffset,accentEnabled,stripeDirection,dotSize,
    colors,colorOpacities,backgroundColor,backgroundColorOpacity,backgroundBlendMode,backgroundTextureKind,extraMain,extraSecondary,extraAccent,stripeConfig,dotConfig,
  }),[type,spacing,width,secondaryWidth,secondaryEnabled,secondaryOffset,accentWidth,accentOffset,accentEnabled,stripeDirection,dotSize,colors,colorOpacities,backgroundColor,backgroundColorOpacity,backgroundBlendMode,backgroundTextureKind,extraMain,extraSecondary,extraAccent,stripeConfig,dotConfig]);
  useEffect(()=>{
    let cancelled=false;
    const image=new Image();
    image.onload=()=>{if(!cancelled){backgroundImageRef.current=image;setBackgroundImageRevision(value=>value+1)}};
    image.src=backgroundTextures.find(item=>item.id===backgroundTextureKind)?.image??"/niuzai.png?v=20260818";
    return()=>{cancelled=true};
  },[backgroundTextureKind]);
  useEffect(()=>{
    const serialized=JSON.stringify(designSnapshot);
    if(restoringHistoryRef.current){restoringHistoryRef.current=false;return}
    if(historyRef.current[historyIndexRef.current]===serialized)return;
    historyRef.current=historyRef.current.slice(0,historyIndexRef.current+1);
    historyRef.current.push(serialized);
    if(historyRef.current.length>80)historyRef.current.shift();
    historyIndexRef.current=historyRef.current.length-1;
    setHistoryAvailability(()=>({canUndo:historyIndexRef.current>0,canRedo:historyIndexRef.current<historyRef.current.length-1}));
  },[designSnapshot]);
  const restoreHistory=(serialized:string)=>{
    const state=JSON.parse(serialized) as DesignSnapshot;
    restoringHistoryRef.current=true;
    setType(state.type);setSpacing(state.spacing);setWidth(state.width);
    setSecondaryWidth(state.secondaryWidth);setAccentWidth(state.accentWidth);
    setSecondaryEnabled(state.secondaryEnabled??true);
    setAccentEnabled(state.accentEnabled??true);
    setSecondaryOffset(state.secondaryOffset??0);
    setAccentOffset(state.accentOffset??0);
    setStripeDirection(state.stripeDirection);setDotSize(state.dotSize);
    setColors(state.colors);setColorOpacities(state.colorOpacities);
    setBackgroundColor(state.backgroundColor??"#FF6464");
    setBackgroundColorOpacity(state.backgroundColorOpacity??100);
    setBackgroundBlendMode(state.backgroundBlendMode??"screen");
    setBackgroundTextureKind(state.backgroundTextureKind??"denim");
    setExtraMain(state.extraMain);setExtraSecondary(state.extraSecondary);setExtraAccent(state.extraAccent);
    if(state.stripeConfig)setStripeConfig(state.stripeConfig);
    if(state.dotConfig)setDotConfig(state.dotConfig);
  };
  const undo=()=>{
    if(historyIndexRef.current<=0)return;
    historyIndexRef.current--;
    restoreHistory(historyRef.current[historyIndexRef.current]);
    setHistoryAvailability(()=>({canUndo:historyIndexRef.current>0,canRedo:historyIndexRef.current<historyRef.current.length-1}));
  };
  const redo=()=>{
    if(historyIndexRef.current>=historyRef.current.length-1)return;
    historyIndexRef.current++;
    restoreHistory(historyRef.current[historyIndexRef.current]);
    setHistoryAvailability(()=>({canUndo:historyIndexRef.current>0,canRedo:historyIndexRef.current<historyRef.current.length-1}));
  };
  const kind = type === "dot" ? "polka-dot" : type === "knit" ? "plaid" : type;
  const previewAspect=useMemo(()=>ratioValue(previewRatio),[previewRatio]);
  const previewPixelSize=useMemo(()=>{
    const longEdge=1920;
    return previewAspect>=1
      ?{width:longEdge,height:Math.round(longEdge/previewAspect)}
      :{width:Math.round(longEdge*previewAspect),height:longEdge};
  },[previewAspect]);
  const patternProject = useMemo(() => {
    const isStripe=type==="stripe";
    const isDot=type==="dot";
    const activeColors=isStripe?stripeConfig.colors:isDot?dotConfig.colors:colors;
    // Stripe spacing is the clear gap between neighbouring main bands.
    // The renderer consumes a repeat period, so add the main-band width.
    const activeSpacing=isStripe?stripeConfig.width+stripeConfig.spacing:isDot?dotConfig.gapX:spacing;
    const activeWidth=isStripe?stripeConfig.width:width;
    const activeSecondaryWidth=isStripe?stripeConfig.secondaryWidth:secondaryWidth;
    const activeAccentWidth=isStripe?stripeConfig.accentWidth:accentWidth;
    const activeOpacities=isStripe?stripeConfig.colorOpacities:isDot?dotConfig.colorOpacities:colorOpacities;
    const bands=isStripe
      ?{main:[{width:activeWidth,color:activeColors[1],opacity:activeOpacities[1]}],secondary:stripeConfig.secondaryEnabled?[{width:activeSecondaryWidth,color:activeColors[2]||activeColors[1],opacity:activeOpacities[2],offset:stripeConfig.secondaryOffset},...stripeConfig.extraSecondary]:[],accent:stripeConfig.accentEnabled?[{width:activeAccentWidth,color:activeColors[3]||activeColors[2],opacity:activeOpacities[3],offset:stripeConfig.accentOffset},...stripeConfig.extraAccent]:[]}
      :{main:[{width,color:colors[1],opacity:colorOpacities[1]}],secondary:secondaryEnabled?[{width:secondaryWidth,color:colors[2]||colors[1],opacity:colorOpacities[2],offset:secondaryOffset},...extraSecondary]:[],accent:accentEnabled?[{width:accentWidth,color:colors[3]||colors[2],opacity:colorOpacities[3]},...extraAccent]:[]};
    const project=createProject(kind, activeColors, activeSpacing, activeWidth, opacity, isDot?dotConfig.size:dotSize, texture, activeSecondaryWidth, activeAccentWidth,bands);
    if(type==="plaid"){
      for(const layers of [project.warp,project.weft]){
        let accentIndex=0;
        for(const layer of layers){
          if(layer.role!=="accent")continue;
          layer.offset+=accentIndex===0?accentOffset:(extraAccent[accentIndex-1]?.offset??0);
          accentIndex++;
        }
      }
    }
    if(type==="stripe")project.rotation=stripeDirection==="horizontal"?90:0;
    if(type==="dot"&&project.dots){
      project.tile.width=dotConfig.gapX;
      project.tile.height=dotConfig.gapY*2;
      project.sourceTile=dotConfig.gapX;
      project.background=dotConfig.colors[0];
      project.dots.shape=dotConfig.shape;
      project.dots.radius=dotConfig.size;
      project.dots.starPoints=dotConfig.starPoints??5;
      project.dots.gapX=dotConfig.gapX;
      project.dots.gapY=dotConfig.gapY;
      project.dots.rowOffset=dotConfig.rowOffset;
      project.dots.color=dotConfig.colors[1];
      project.dots.opacity=(dotConfig.colorOpacities[1]??100)/100;
      project.dots.alternateColor=dotConfig.colors[2]||dotConfig.colors[1];
      project.dots.alternateOpacity=(dotConfig.colorOpacities[2]??100)/100;
      project.dots.customImage=dotConfig.shape==="custom"?customDotImage:null;
    }
    if(project.diagonal){
      const cell=Math.max(170,Math.round(spacing));
      project.tile.width=cell;
      project.tile.height=cell;
      project.sourceTile=cell;
      project.diagonal.cell=cell;
      project.background=colors[0];
      project.diagonal.positive.angle=45;
      project.diagonal.negative.angle=-45;
      project.diagonal.positive.offset=0;
      project.diagonal.negative.offset=0;
      project.diagonal.positive.period=cell;
      project.diagonal.negative.period=cell;
      project.diagonal.fabric.angle=45;
      project.diagonal.fabric.density=4;
      project.diagonal.fabric.lineWidth=1;
      project.diagonal.fabric.opacity=.18;
      project.diagonal.fabric.strength=.18;
      project.diagonal.fabric.lightColor=colors[2]||"#FFF7EA";
      project.diagonal.fabric.darkColor=colors[1]||"#7B644E";
    }
    if(project.dots&&type!=="dot")project.dots.opacity*=((colorOpacities[1]??100)/100);
    return project
  }, [kind, type, stripeDirection, stripeConfig, dotConfig, customDotImage, colors, colorOpacities, spacing, width, secondaryWidth, secondaryEnabled, secondaryOffset, accentWidth, accentOffset, accentEnabled, extraSecondary, extraAccent, opacity, dotSize, texture]);
  const previewRepeatSize=useMemo(()=>type==="stripe"
    ?patternProject.tile.width*1.45
    :Math.max(120,Math.round(patternProject.tile.width*1.45))
  ,[patternProject.tile.width,type]);
  useEffect(()=>{
    const target=canvasRef.current;
    if(!target)return;
    if(type==="knit"){
      const source=backgroundImageRef.current;
      if(!source)return;
      target.width=previewPixelSize.width;target.height=previewPixelSize.height;
      const ctx=target.getContext("2d")!;
      ctx.clearRect(0,0,target.width,target.height);
      ctx.drawImage(drawColoredTexture(source,target.width,target.height,backgroundColor,backgroundColorOpacity,backgroundBlendMode),0,0);
      return;
    }
    target.width=previewPixelSize.width;
    target.height=previewPixelSize.height;
    // Setting canvas.width/height resets every context property. Configure
    // smoothing only after the backing store has been resized.
    const ctx=target.getContext("2d")!;
    if(type==="plaid"){
      ctx.clearRect(0,0,target.width,target.height);
      ctx.drawImage(renderPlaidField(patternProject,target.width,target.height,previewRepeatSize),0,0);
      return;
    }
    // Dot silhouettes are vector paths, so render them to a denser source
    // tile before scaling the repeat down into the preview.
    const sourceTile=renderPattern(patternProject,type==="dot"?16:8);
    const shouldSmoothPattern=type==="dot";
    ctx.imageSmoothingEnabled=shouldSmoothPattern;
    if(shouldSmoothPattern)ctx.imageSmoothingQuality="high";
    // Plaid benefits from a minimum on-screen tile size, but applying that
    // normalization to stripes makes every repeat below ~80px appear equally
    // spaced: shrinking the gap then only changes the band's apparent width.
    // Keep stripe pixels at a fixed preview scale so every gap value changes
    // the actual repeat density continuously, all the way down to zero.
    const previewScale=previewRepeatSize/sourceTile.width;
    ctx.clearRect(0,0,target.width,target.height);
    const pattern=ctx.createPattern(sourceTile,"repeat")!;
    if("setTransform" in pattern){
      pattern.setTransform(new DOMMatrix().scaleSelf(previewScale,previewScale));
    }
    ctx.fillStyle=pattern;
    ctx.fillRect(0,0,target.width,target.height)
  },[patternProject,previewPixelSize,previewRepeatSize,type,backgroundColor,backgroundColorOpacity,backgroundBlendMode,backgroundImageRevision,view]);

  const applyPlaidPreset=()=>{
    setSpacing(201);
    setWidth(50);
    setSecondaryWidth(14);
    setSecondaryEnabled(true);
    setSecondaryOffset(14);
    setAccentWidth(23);
    setAccentOffset(80);
    setAccentEnabled(true);
    setColors([...initialPlaidColors]);
    setColorOpacities([100,100,100,100]);
    setExtraMain([]);
    setExtraSecondary([]);
    setExtraAccent(initialPlaidAccentBands.map(band=>({...band})));
  };
  const reset = () => {
    setType("plaid");
    applyPlaidPreset();
    setStripeDirection("vertical");
    setDotSize(9);
    setBackgroundColor("#FF6464");
    setBackgroundColorOpacity(100);
    setBackgroundBlendMode("screen");
    setBackgroundTextureKind("denim");
    setDotConfig({
      shape:"circle",
      size:18,
      starPoints:5,
      gapX:188,
      gapY:93,
      rowOffset:105,
      colors:["#5C2C0D","#F6C8C4","#FFFFFF"],
      colorOpacities:[100,100,100],
    });
    setExtraMain([]);
    setExtraSecondary([]);
  };
  const randomize = () => {
    if(type==="knit")return;
    const randomInt=(min:number,max:number)=>Math.floor(Math.random()*(max-min+1))+min;
    const makeBands=(count:number,minWidth:number,maxWidth:number,minOffset:number,maxOffset:number,startColor=2):ControlBand[] =>
      Array.from({length:count},(_,index)=>({
        id:Date.now()+index+Math.random(),
        width:randomInt(minWidth,maxWidth),
        color:palette[(startColor+index)%palette.length]||palette[1],
        opacity:100,
        offset:randomInt(minOffset,maxOffset),
      }));
    let palette:string[];
    if(importPalette.length>=2){
      palette=randomizedImagePalette(importPalette);
    }else{
      palette=[...curatedPlaidPalettes[Math.floor(Math.random()*curatedPlaidPalettes.length)]];
    }
    const main=randomInt(18,68);
    const secondary=randomInt(4,Math.min(36,Math.max(8,Math.round(main*.75))));
    const fine=randomInt(2,14);
    if(type==="stripe"){
      const secondaryCount=randomInt(0,3);
      const accentCount=randomInt(0,3);
      setStripeConfig(current=>({
        ...current,
        spacing:randomInt(35,300),
        width:main,
        secondaryWidth:secondary,
        secondaryEnabled:secondaryCount>0,
        secondaryOffset:randomInt(0,55),
        accentWidth:fine,
        accentEnabled:accentCount>0,
        accentOffset:randomInt(-120,120),
        colors:palette,
        colorOpacities:palette.map(()=>100),
        extraSecondary:makeBands(Math.max(0,secondaryCount-1),4,32,0,60,3),
        extraAccent:makeBands(Math.max(0,accentCount-1),2,18,-150,150,3),
      }));
      return;
    }
    if(type==="dot"){
      const gapX=Math.floor(Math.random()*45)+68;
      setDotConfig(current=>({
        ...current,
        size:Math.floor(Math.random()*14)+12,
        gapX,
        gapY:Math.floor(Math.random()*35)+58,
        rowOffset:Math.round(gapX/2),
        colors:[palette[0],palette[1],palette[2]||palette[1]],
        colorOpacities:[100,100,100],
      }));
      return;
    }
    const secondaryCount=randomInt(0,3);
    const accentCount=randomInt(0,4);
    setSpacing(randomInt(170,230));
    setWidth(main);
    setSecondaryWidth(secondary);
    setSecondaryEnabled(secondaryCount>0);
    setSecondaryOffset(randomInt(0,55));
    setAccentWidth(fine);
    setAccentOffset(randomInt(-120,120));
    setAccentEnabled(accentCount>0);
    setColors(palette);
    setColorOpacities(palette.map(()=>100));
    setExtraSecondary(makeBands(Math.max(0,secondaryCount-1),4,32,0,60,3));
    setExtraAccent(makeBands(Math.max(0,accentCount-1),2,18,-150,150,3));
  };
  const setColor=(index:number,value:string)=>setColors(current=>{const next=[...current];while(next.length<=index)next.push(next[next.length-1]||"#FFFFFF");next[index]=value;return next});
  const setColorOpacity=(index:number,value:number)=>setColorOpacities(current=>{const next=[...current];while(next.length<=index)next.push(100);next[index]=value;return next});
  const patchDot=(patch:Partial<DotConfig>)=>setDotConfig(current=>({...current,...patch}));
  const setDotColor=(index:number,value:string)=>setDotConfig(current=>{const next=[...current.colors];next[index]=value;return{...current,colors:next}});
  const setDotOpacity=(index:number,value:number)=>setDotConfig(current=>{const next=[...current.colorOpacities];next[index]=value;return{...current,colorOpacities:next}});
  const importCustomDot=(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    const allowed=file.type==="image/png"||file.type==="image/svg+xml"||/\.(png|svg)$/i.test(file.name);
    if(!allowed){window.alert("请上传透明背景的 PNG 或 SVG 文件");e.target.value="";return}
    const reader=new FileReader();
    reader.onload=()=>{
      if(typeof reader.result!=="string")return;
      const image=new Image();
      image.onload=()=>{
        setCustomDotImage(image);
        setCustomDotSource(reader.result as string);
        setCustomDotName(file.name);
        patchDot({shape:"custom"});
      };
      image.onerror=()=>window.alert("图形文件读取失败，请换一个 PNG 或 SVG 文件");
      image.src=reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value="";
  };
  const addBand=(setter:React.Dispatch<React.SetStateAction<ControlBand[]>>,width:number,color:string)=>setter(current=>[...current,{id:Date.now()+current.length,width,color,opacity:100,offset:0}]);
  const updateBand=(setter:React.Dispatch<React.SetStateAction<ControlBand[]>>,id:number,patch:Partial<ControlBand>)=>setter(current=>current.map(b=>b.id===id?{...b,...patch}:b));
  const removeBand=(setter:React.Dispatch<React.SetStateAction<ControlBand[]>>,id:number)=>setter(current=>current.filter(b=>b.id!==id));
  const addSecondaryPair=()=>{
    if(!secondaryEnabled){setSecondaryEnabled(true);return}
    addBand(setExtraSecondary,Math.max(4,Math.round(secondaryWidth*.7)),colors[3]||colors[2]);
  };
  const removeSecondaryPair=()=>{
    if(extraSecondary.length){setExtraSecondary(current=>current.slice(0,-1));return}
    setSecondaryEnabled(false);
  };
  const addPlaidAccent=()=>{
    if(!accentEnabled){setAccentEnabled(true);return}
    addBand(setExtraAccent,Math.max(4,accentWidth),colors[4]||colors[3]);
  };
  const removePlaidAccent=()=>{
    if(extraAccent.length){setExtraAccent(current=>current.slice(0,-1));return}
    setAccentEnabled(false);
  };
  const patchStripe=(patch:Partial<StripeConfig>)=>setStripeConfig(current=>({...current,...patch}));
  const setStripeColor=(index:number,value:string)=>setStripeConfig(current=>{const next=[...current.colors];while(next.length<=index)next.push(next[next.length-1]||"#FFFFFF");next[index]=value;return{...current,colors:next}});
  const setStripeOpacity=(index:number,value:number)=>setStripeConfig(current=>{const next=[...current.colorOpacities];while(next.length<=index)next.push(100);next[index]=value;return{...current,colorOpacities:next}});
  const addStripeSecondary=()=>setStripeConfig(current=>current.secondaryEnabled
    ?{...current,extraSecondary:[...current.extraSecondary,{id:Date.now(),width:Math.max(4,Math.round(current.secondaryWidth*.7)),color:current.colors[3]||current.colors[2],opacity:100,offset:0}]}
    :{...current,secondaryEnabled:true});
  const removeStripeSecondary=()=>setStripeConfig(current=>current.extraSecondary.length
    ?{...current,extraSecondary:current.extraSecondary.slice(0,-1)}
    :{...current,secondaryEnabled:false});
  const addStripeAccent=()=>setStripeConfig(current=>current.accentEnabled
    ?{...current,extraAccent:[...current.extraAccent,{id:Date.now(),width:current.accentWidth,color:current.colors[3],opacity:100,offset:0}]}
    :{...current,accentEnabled:true});
  const removeStripeAccent=()=>setStripeConfig(current=>current.extraAccent.length
    ?{...current,extraAccent:current.extraAccent.slice(0,-1)}
    :{...current,accentEnabled:false});

  const processImportFile = (file:File) => {
    if(!file.type.startsWith("image/"))return;
    const reader=new FileReader();
    reader.onload=()=>setImportPreview(typeof reader.result==="string"?reader.result:null);
    reader.readAsDataURL(file);
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas"); canvas.width = 96; canvas.height = 96;
      const ctx = canvas.getContext("2d")!; ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(img, 0, 0, 96, 96);
      const data = ctx.getImageData(0, 0, 96, 96).data;
      const picked = extractDiversePalette(data,9);
      if (picked.length >= 2) {
        setImportPalette(picked);
        const sorted=[...picked].sort((a,b)=>colorLightness(a)-colorLightness(b));
        const importedColors=[sorted[sorted.length-1],sorted[0],sorted[1]||sorted[0],sorted[2]||sorted[1]||sorted[0],sorted[3]||sorted[2]||sorted[0]];
        if(type==="stripe"){
          setStripeConfig(current=>({...current,colors:importedColors,colorOpacities:importedColors.map(()=>100)}));
        }else if(type==="dot"){
          setDotConfig(current=>({...current,colors:[importedColors[0],importedColors[1],importedColors[2]||importedColors[1]],colorOpacities:[100,100,100]}));
        }else{
          setColors(importedColors);
        }
      }
      URL.revokeObjectURL(url);
    };
    img.onerror=()=>URL.revokeObjectURL(url);
    img.src = url;
  };
  const importImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(file)processImportFile(file);
    e.target.value = "";
  };
  const dropImportImage=(event:DragEvent<HTMLDivElement>)=>{
    event.preventDefault();
    setIsImportDragging(false);
    const file=Array.from(event.dataTransfer.files).find(item=>item.type.startsWith("image/"));
    if(file)processImportFile(file);
  };
  const clearImportedImage=()=>{
    setImportPreview(null);
    setImportPalette([]);
    if(fileRef.current)fileRef.current.value="";
  };

  const exportDimensions=useMemo(()=>{
    const longEdge=4096;
    return previewAspect>=1
      ?{width:longEdge,height:Math.round(longEdge/previewAspect)}
      :{width:Math.round(longEdge*previewAspect),height:longEdge};
  },[previewAspect]);
  const drawCanvas = useCallback((canvasWidth=exportDimensions.width,canvasHeight=exportDimensions.height) => {
    if(type==="knit"&&backgroundImageRef.current)return drawColoredTexture(backgroundImageRef.current,canvasWidth,canvasHeight,backgroundColor,backgroundColorOpacity,backgroundBlendMode);
    if(type==="plaid"){
      const exportedRepeat=previewRepeatSize*(canvasWidth/previewPixelSize.width);
      return renderPlaidField(patternProject,canvasWidth,canvasHeight,exportedRepeat);
    }
    const tile=renderPattern(patternProject,type==="dot"?16:8),canvas=document.createElement("canvas");
    canvas.width=canvasWidth;
    canvas.height=canvasHeight;
    const ctx=canvas.getContext("2d")!;
    const shouldSmoothPattern=type==="dot";
    ctx.imageSmoothingEnabled=shouldSmoothPattern;
    if(shouldSmoothPattern)ctx.imageSmoothingQuality="high";
    const pattern=ctx.createPattern(tile,"repeat")!;
    // Match the preview's number of visible repeats, then scale that framing
    // proportionally to the requested export resolution.
    if("setTransform" in pattern){
      const exportedRepeat=previewRepeatSize*(canvasWidth/previewPixelSize.width);
      pattern.setTransform(new DOMMatrix().scaleSelf(exportedRepeat/tile.width,exportedRepeat/tile.width));
    }
    ctx.fillStyle=pattern;
    ctx.fillRect(0,0,canvasWidth,canvasHeight);
    return canvas
  },[patternProject,exportDimensions,previewRepeatSize,previewPixelSize.width,type,backgroundColor,backgroundColorOpacity,backgroundBlendMode]);

  const exportPng = () => { const a=document.createElement("a"); a.download=`${projectName}-${previewRatio.replace(":","x")}.png`; a.href=drawCanvas().toDataURL("image/png"); a.click(); };
  const exportSvg = () => { const {width:exportWidth,height:exportHeight}=exportDimensions;const png=drawCanvas(exportWidth,exportHeight).toDataURL("image/png"); const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}" viewBox="0 0 ${exportWidth} ${exportHeight}"><image href="${png}" width="${exportWidth}" height="${exportHeight}"/></svg>`; const a=document.createElement("a"); a.download=`${projectName}-${previewRatio.replace(":","x")}.svg`; a.href=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"})); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),500); };
  const copyCss = async () => { const tile=type==="knit"&&backgroundImageRef.current?drawColoredTexture(backgroundImageRef.current,512,512,backgroundColor,backgroundColorOpacity,backgroundBlendMode):renderPattern(patternProject,6);await navigator.clipboard.writeText(`background-color:${type==="knit"?backgroundColor:patternProject.background};\nbackground-image:url(${tile.toDataURL("image/png")});\nbackground-size:cover;`); setSaved(true); setTimeout(()=>setSaved(false),1500); };
  const persistLibrary=(next:SavedDesign[])=>{
    window.localStorage.setItem(libraryStorageKey,JSON.stringify(next));
    setSavedDesigns(next);
  };
  const saveToLibrary=()=>{
    const thumbWidth=480,thumbHeight=Math.max(240,Math.round(thumbWidth/previewAspect));
    const entry:SavedDesign={id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,name:projectName.trim()||"未命名图案",type,snapshot:JSON.stringify(designSnapshot),preview:drawCanvas(thumbWidth,thumbHeight).toDataURL("image/jpeg",.82),createdAt:Date.now(),customDotSource:dotConfig.shape==="custom"?customDotSource??undefined:undefined,customDotName:dotConfig.shape==="custom"?customDotName||undefined:undefined};
    try{
      persistLibrary([entry,...savedDesigns]);
      setLibraryNotice(true);
      setTimeout(()=>setLibraryNotice(false),1600);
    }catch{
      window.alert("本机存储空间不足，请先在纹理库中删除部分作品");
    }
  };
  const openSavedDesign=(entry:SavedDesign)=>{
    restoreHistory(entry.snapshot);
    setProjectName(entry.name);
    if(entry.customDotSource){
      const image=new Image();
      image.onload=()=>setCustomDotImage(image);
      image.src=entry.customDotSource;
      setCustomDotSource(entry.customDotSource);
      setCustomDotName(entry.customDotName||"自定义图形");
    }else{
      setCustomDotImage(null);
      setCustomDotSource(null);
      setCustomDotName("");
    }
    setView("editor");
  };
  const deleteSavedDesign=(id:string)=>{
    try{persistLibrary(savedDesigns.filter(entry=>entry.id!==id))}
    catch{window.alert("删除失败，请稍后重试")}
  };
  const libraryTypes:{id:LibraryFilter;label:string}[]=[{id:"all",label:"全部"},...types.map(item=>({id:item.id,label:item.label}))];
  const visibleDesigns=libraryFilter==="all"?savedDesigns:savedDesigns.filter(entry=>entry.type===libraryFilter);

  if(view==="library")return <main className="libraryPage">
    <header className="libraryHeader"><button type="button" className="libraryBrand" onClick={()=>setView("home")}><img src="/lavie-wordmark-header.png" alt="RPDCLavie"/></button><h1>我的纹理库</h1><button type="button" className="libraryCreate" onClick={()=>setView("editor")}>＋ 创建纹理</button></header>
    <section className="libraryContent">
      <nav className="libraryTabs" aria-label="纹理分类">{libraryTypes.map(item=><button type="button" key={item.id} className={libraryFilter===item.id?"active":""} onClick={()=>setLibraryFilter(item.id)}>{item.label}<span>{item.id==="all"?savedDesigns.length:savedDesigns.filter(entry=>entry.type===item.id).length}</span></button>)}</nav>
      {visibleDesigns.length?<div className="libraryGrid">{visibleDesigns.map(entry=><article className="libraryCard" key={entry.id}><button type="button" className="libraryPreview" onClick={()=>openSavedDesign(entry)}><img src={entry.preview} alt={`${entry.name}预览`}/></button><div className="libraryCardMeta"><button type="button" className="libraryName" onClick={()=>openSavedDesign(entry)}>{entry.name}</button><small>{types.find(item=>item.id===entry.type)?.label} · {new Date(entry.createdAt).toLocaleDateString("zh-CN")}</small></div><button type="button" className="deleteSaved" aria-label={`删除${entry.name}`} title="删除" onClick={()=>deleteSavedDesign(entry.id)}>×</button></article>)}</div>:<div className="emptyLibrary"><span>▦</span><h2>这里还没有纹理</h2><p>前往创建纹理，保存后会显示在对应分类中。</p><button type="button" onClick={()=>setView("editor")}>创建第一个纹理 →</button></div>}
    </section>
  </main>;

  if(view==="home")return <main className="landingPage">
    <div className="landingBackdrop" aria-hidden="true"/>
    <section className="landingHero" aria-label="RPDCLavie 纹理设计">
      <img className="landingLogo" src="./logo1.png" alt="RPDCLavie"/>
      <div className="landingActions">
        <button type="button" className="landingPrimary" onClick={()=>setView("editor")}>创建纹理 <span aria-hidden="true">→</span></button>
        <button type="button" className="landingSecondary" onClick={()=>setView("library")}>我的纹理库 <span aria-hidden="true">→</span></button>
      </div>
    </section>
    <img className="landingPatterns" src="./bg2.png" alt="" aria-hidden="true"/>
  </main>;

  return <main className="appShell">
    <header className="topbar">
      <button type="button" className="brand" aria-label="返回首页" onClick={()=>setView("home")}><img src="/logo2.png" alt="RPDCLavie"/></button>
      <button type="button" className="libraryLink" onClick={()=>setView("library")}>我的纹理库 <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3.5 10.5 12 3.75l8.5 6.75v9.25h-6v-5.5h-5v5.5h-6z"/></svg></button>
    </header>

    <section className="workspace">
      <aside className="typePanel">
        <div className="panelTitle"><span>图案类型</span><small>01</small></div>
        <div className="typeList">{types.map(item=><button key={item.id} className={`typeCard ${type===item.id?"active":""}`} onClick={()=>{setType(item.id);if(item.id==="knit")setPreviewRatio("3:4")}}><span className={`typeGlyph ${item.id}`}>{item.glyph}</span><span><b>{item.label}</b><small>{item.desc}</small></span><i>›</i></button>)}</div>
        <div className={`importCard ${importPreview?"hasPreview":""} ${isImportDragging?"isDragging":""}`} onDragEnter={event=>{event.preventDefault();setIsImportDragging(true)}} onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect="copy";setIsImportDragging(true)}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setIsImportDragging(false)}} onDrop={dropImportImage}>
          <div className="importPreview">{importPreview?<img src={importPreview} alt="已导入图片预览"/>:<><span className="uploadIcon">↥</span><b>{isImportDragging?"松开以上传图片":"从图片提取配色"}</b><small>点击下方按钮/直接拖入图片<br/>自动生成2-5种颜色</small></>}</div>
          {importPreview?<div className="importActions"><button type="button" className="clearImport" onClick={clearImportedImage}>清除</button><button type="button" onClick={()=>fileRef.current?.click()}>重新导入图片</button></div>:<button type="button" onClick={()=>fileRef.current?.click()}>导入图片</button>}
          <input ref={fileRef} type="file" accept="image/*" onChange={importImage}/>
        </div>
      </aside>

      <aside className="controlPanel">
        <div className="controls mergedControls">
          <div className="sectionLabel">
            <span className="sectionLabelTitle">基础设置</span>
            <span className="sectionLabelNumber">02</span>
            <span className="sectionLabelTools">
              <button className="historyButton" aria-label="撤销" title="撤销" disabled={!historyAvailability.canUndo} onClick={undo}>↶</button>
              <button className="historyButton" aria-label="重做" title="重做" disabled={!historyAvailability.canRedo} onClick={redo}>↷</button>
              <button className="clearButton" aria-label="清空" title="清空" onClick={reset}><svg aria-hidden="true" viewBox="0 0 24 18"><path d="M8 1.5h13v15H8L1.5 9 8 1.5Z"/><path d="m11 5.5 5 7m0-7-5 7"/></svg></button>
            </span>
          </div>
          <div className="controlsScroll">
          {type!=="knit"&&<div className="randomizeRow"><button onClick={randomize}>✦ {importPalette.length>=2?"图片配色随机":"随机生成"}</button></div>}
          {type==="dot"&&<div className="customDotUpload"><button type="button" className={dotConfig.shape==="custom"?"active":""} onClick={()=>customDotFileRef.current?.click()}>＋ 上传自定义单元图形</button><small>{customDotName?`当前：${customDotName}`:"支持透明背景 PNG / SVG，推荐 SVG"}</small><input ref={customDotFileRef} type="file" accept=".png,.svg,image/png,image/svg+xml" onChange={importCustomDot}/></div>}
          {type!=="plaid"&&type!=="knit"&&<div className={`modeSegment ${type==="dot"?"dotMode":""}`}>{type==="stripe"&&<><button className={stripeDirection==="vertical"?"active":""} onClick={()=>setStripeDirection("vertical")}>竖条纹</button><button className={stripeDirection==="horizontal"?"active":""} onClick={()=>setStripeDirection("horizontal")}>横条纹</button></>}{type==="dot"&&dotShapes.map(shape=><button key={shape.id} className={dotConfig.shape===shape.id?"active":""} onClick={()=>patchDot({shape:shape.id})}>{shape.label}</button>)}</div>}
          {type==="knit"?<><select className="styleSelect backgroundTextureSelect" aria-label="纹理类型" value={backgroundTextureKind} onChange={event=>setBackgroundTextureKind(event.target.value as BackgroundTextureKind)}>{backgroundTextures.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select><div className="backgroundBlendControl"><span>颜色模式</span><div className="modeSegment"><button className={backgroundBlendMode==="screen"?"active":""} onClick={()=>setBackgroundBlendMode("screen")}>滤色</button><button className={backgroundBlendMode==="multiply"?"active":""} onClick={()=>setBackgroundBlendMode("multiply")}>正片叠底</button><button className={backgroundBlendMode==="soft-light"?"active":""} onClick={()=>setBackgroundBlendMode("soft-light")}>柔光</button></div></div><div className="backgroundColor"><span>颜色</span><ColorField label="颜色" value={backgroundColor} onChange={setBackgroundColor}/></div><Slider label="颜色透明度" value={backgroundColorOpacity} min={0} max={100} unit="%" onChange={setBackgroundColorOpacity}/></>:type==="stripe"?<>
            <div className="backgroundColor"><span>底色</span><ColorField label="底色" value={stripeConfig.colors[0]} opacity={stripeConfig.colorOpacities[0]} onChange={value=>setStripeColor(0,value)} onOpacityChange={value=>setStripeOpacity(0,value)}/></div>
            <FineLineControl label="主色带 1" width={stripeConfig.width} offset={stripeConfig.spacing} widthMin={1} widthMax={120} offsetMin={0} offsetMax={300} offsetLabel="间距" color={stripeConfig.colors[1]} colorOpacity={stripeConfig.colorOpacities[1]} onWidthChange={value=>patchStripe({width:value})} onOffsetChange={value=>patchStripe({spacing:value})} onColorChange={value=>setStripeColor(1,value)} onColorOpacityChange={value=>setStripeOpacity(1,value)}/>
            <FineLineControl label={stripeConfig.secondaryEnabled?"副色带 1":"副色带（0组）"} width={stripeConfig.secondaryWidth} offset={stripeConfig.secondaryOffset} widthMin={4} widthMax={36} offsetMin={0} offsetMax={60} color={stripeConfig.colors[2]} colorOpacity={stripeConfig.colorOpacities[2]} onWidthChange={value=>patchStripe({secondaryWidth:value})} onOffsetChange={value=>patchStripe({secondaryOffset:value})} onColorChange={value=>setStripeColor(2,value)} onColorOpacityChange={value=>setStripeOpacity(2,value)} onAdd={addStripeSecondary} onRemove={removeStripeSecondary}/>
            {stripeConfig.secondaryEnabled&&stripeConfig.extraSecondary.map((band,index)=><FineLineControl key={band.id} label={`副色带 ${index+2}`} width={band.width} offset={band.offset??0} widthMin={4} widthMax={36} offsetMin={0} offsetMax={60} color={band.color} colorOpacity={band.opacity} onWidthChange={value=>patchStripe({extraSecondary:stripeConfig.extraSecondary.map(item=>item.id===band.id?{...item,width:value}:item)})} onOffsetChange={value=>patchStripe({extraSecondary:stripeConfig.extraSecondary.map(item=>item.id===band.id?{...item,offset:value}:item)})} onColorChange={value=>patchStripe({extraSecondary:stripeConfig.extraSecondary.map(item=>item.id===band.id?{...item,color:value}:item)})} onColorOpacityChange={value=>patchStripe({extraSecondary:stripeConfig.extraSecondary.map(item=>item.id===band.id?{...item,opacity:value}:item)})} onRemove={()=>patchStripe({extraSecondary:stripeConfig.extraSecondary.filter(item=>item.id!==band.id)})}/>)}
            <FineLineControl label={stripeConfig.accentEnabled?"辅助色带 1":"辅助色带（0条）"} width={stripeConfig.accentWidth} offset={stripeConfig.accentOffset} widthMin={4} widthMax={36} offsetMin={-150} offsetMax={150} color={stripeConfig.colors[3]} colorOpacity={stripeConfig.colorOpacities[3]} onWidthChange={value=>patchStripe({accentWidth:value})} onOffsetChange={value=>patchStripe({accentOffset:value})} onColorChange={value=>setStripeColor(3,value)} onColorOpacityChange={value=>setStripeOpacity(3,value)} onAdd={addStripeAccent} onRemove={removeStripeAccent}/>
            {stripeConfig.accentEnabled&&stripeConfig.extraAccent.map((band,index)=><FineLineControl key={band.id} label={`辅助色带 ${index+2}`} width={band.width} offset={band.offset??0} color={band.color} colorOpacity={band.opacity} onWidthChange={value=>patchStripe({extraAccent:stripeConfig.extraAccent.map(item=>item.id===band.id?{...item,width:value}:item)})} onOffsetChange={value=>patchStripe({extraAccent:stripeConfig.extraAccent.map(item=>item.id===band.id?{...item,offset:value}:item)})} onColorChange={value=>patchStripe({extraAccent:stripeConfig.extraAccent.map(item=>item.id===band.id?{...item,color:value}:item)})} onColorOpacityChange={value=>patchStripe({extraAccent:stripeConfig.extraAccent.map(item=>item.id===band.id?{...item,opacity:value}:item)})} onRemove={()=>patchStripe({extraAccent:stripeConfig.extraAccent.filter(item=>item.id!==band.id)})}/>)}
          </>:<>
          {type==="dot"?<>
            <div className="backgroundColor"><span>底色</span><ColorField label="底色" value={dotConfig.colors[0]} opacity={dotConfig.colorOpacities[0]} onChange={value=>setDotColor(0,value)} onOpacityChange={value=>setDotOpacity(0,value)}/></div>
            <Slider label="图形大小" value={dotConfig.size} min={4} max={48} unit=" px" onChange={value=>patchDot({size:value})}/>
            {dotConfig.shape==="star"&&<Slider label="星星角数" value={dotConfig.starPoints??5} min={3} max={6} unit=" 角" onChange={value=>patchDot({starPoints:value})}/>}
            <div className="backgroundColor"><span>上一行颜色</span><ColorField label="上一行颜色" value={dotConfig.colors[1]} opacity={dotConfig.colorOpacities[1]} onChange={value=>setDotColor(1,value)} onOpacityChange={value=>setDotOpacity(1,value)}/></div>
            <div className="backgroundColor"><span>下一行颜色</span><ColorField label="下一行颜色" value={dotConfig.colors[2]||dotConfig.colors[1]} opacity={dotConfig.colorOpacities[2]??100} onChange={value=>setDotColor(2,value)} onOpacityChange={value=>setDotOpacity(2,value)}/></div>
            <Slider label="横向间距" value={dotConfig.gapX} min={24} max={400} unit=" px" onChange={value=>patchDot({gapX:value,rowOffset:Math.min(value,dotConfig.rowOffset)})}/>
            <Slider label="纵向间距" value={dotConfig.gapY} min={24} max={180} unit=" px" onChange={value=>patchDot({gapY:value})}/>
            <Slider label="隔行偏移" value={dotConfig.rowOffset} min={0} max={dotConfig.gapX} unit=" px" onChange={value=>patchDot({rowOffset:value})}/>
          </>:<>
          <div className="backgroundColor"><span>底色</span><ColorField label="底色" value={colors[0]} opacity={colorOpacities[0]} onChange={value=>setColor(0,value)} onOpacityChange={value=>setColorOpacity(0,value)}/></div>
          <Slider label="重复单元" value={spacing} min={170} max={230} unit=" px" onChange={setSpacing}/>
          <>
            <Slider label="主色带 1" value={width} min={8} max={120} unit=" px" onChange={setWidth} color={colors[1]} colorOpacity={colorOpacities[1]} onColorChange={v=>setColor(1,v)} onColorOpacityChange={v=>setColorOpacity(1,v)}/>
            <FineLineControl label={secondaryEnabled?"副色带 1":"副色带（0组）"} width={secondaryWidth} offset={secondaryOffset} widthMin={4} widthMax={36} offsetMin={0} offsetMax={60} color={colors[2]||colors[1]} colorOpacity={colorOpacities[2]} onWidthChange={setSecondaryWidth} onOffsetChange={setSecondaryOffset} onColorChange={v=>setColor(2,v)} onColorOpacityChange={v=>setColorOpacity(2,v)} onAdd={addSecondaryPair} onRemove={removeSecondaryPair}/>
            {secondaryEnabled&&extraSecondary.map((b,i)=><FineLineControl key={b.id} label={`副色带 ${i+2}`} width={b.width} offset={b.offset??0} widthMin={4} widthMax={36} offsetMin={0} offsetMax={60} color={b.color} colorOpacity={b.opacity} onWidthChange={v=>updateBand(setExtraSecondary,b.id,{width:v})} onOffsetChange={v=>updateBand(setExtraSecondary,b.id,{offset:v})} onColorChange={v=>updateBand(setExtraSecondary,b.id,{color:v})} onColorOpacityChange={v=>updateBand(setExtraSecondary,b.id,{opacity:v})} onRemove={()=>removeBand(setExtraSecondary,b.id)}/>)}
            {type==="plaid"?<>
              <FineLineControl label={accentEnabled?"辅助色带 1":"辅助色带（0条）"} width={accentWidth} offset={accentOffset} color={colors[3]||colors[2]} colorOpacity={colorOpacities[3]} onWidthChange={setAccentWidth} onOffsetChange={setAccentOffset} onColorChange={v=>setColor(3,v)} onColorOpacityChange={v=>setColorOpacity(3,v)} onAdd={addPlaidAccent} onRemove={removePlaidAccent}/>
              {extraAccent.map((b,i)=><FineLineControl key={b.id} label={`辅助色带 ${i+2}`} width={b.width} offset={b.offset??0} color={b.color} colorOpacity={b.opacity} onWidthChange={v=>updateBand(setExtraAccent,b.id,{width:v})} onOffsetChange={v=>updateBand(setExtraAccent,b.id,{offset:v})} onColorChange={v=>updateBand(setExtraAccent,b.id,{color:v})} onColorOpacityChange={v=>updateBand(setExtraAccent,b.id,{opacity:v})} onRemove={()=>removeBand(setExtraAccent,b.id)}/>)}
            </>:<>
              <Slider label="辅助色带 1" value={accentWidth} min={4} max={36} unit=" px" onChange={setAccentWidth} color={colors[3]||colors[2]} colorOpacity={colorOpacities[3]} onColorChange={v=>setColor(3,v)} onColorOpacityChange={v=>setColorOpacity(3,v)} onAdd={()=>addBand(setExtraAccent,Math.max(4,accentWidth),colors[4]||colors[3])}/>
              {extraAccent.map((b,i)=><Slider key={b.id} label={`辅助色带 ${i+2}`} value={b.width} min={4} max={36} unit=" px" onChange={v=>updateBand(setExtraAccent,b.id,{width:v})} color={b.color} colorOpacity={b.opacity} onColorChange={v=>updateBand(setExtraAccent,b.id,{color:v})} onColorOpacityChange={v=>updateBand(setExtraAccent,b.id,{opacity:v})} onRemove={()=>removeBand(setExtraAccent,b.id)}/>)}
            </>}
          </>
          </>}
          </>}
          </div>
        </div>
      </aside>

      <section className="stage">
        <div className="stageTop"><div><span className="liveDot"/>实时预览 <small>{type==="knit"?`${backgroundTextures.find(item=>item.id===backgroundTextureKind)?.label??"牛仔"}纹理`:kind==="plaid"?"样式一":type==="stripe"?(stripeDirection==="vertical"?"竖条纹":"横条纹"):(dotConfig.shape==="custom"?"自定义图形":dotShapes.find(shape=>shape.id===dotConfig.shape)?.label??"圆点")}{type!=="knit"&&<> · {type==="stripe"?stripeConfig.spacing:type==="dot"?dotConfig.gapX:spacing}px</>}</small></div><div className="zoom"><button onClick={()=>setZoom(Math.max(50,zoom-10))}>−</button><span>{zoom}%</span><button onClick={()=>setZoom(Math.min(150,zoom+10))}>＋</button><button onClick={()=>setZoom(100)}>⊙</button></div><div className="stageProject"><input aria-label="项目名称" value={projectName} onChange={e=>setProjectName(e.target.value)}/></div></div>
        <div className="previewRatioBar"><span>预览比例</span>{previewRatios.map(ratio=><button key={ratio} className={previewRatio===ratio?"active":""} onClick={()=>setPreviewRatio(ratio)}>{ratio}</button>)}</div>
        <div className="canvasWrap"><div className={`patternCanvas ${type==="dot"||type==="plaid"||type==="knit"?"smoothCanvas":""}`} style={{aspectRatio:String(previewAspect),width:previewAspect>=1?"min(72vh,74vw)":`min(${72*previewAspect}vh,74vw)`,transform:`scale(${(zoom/100)*1.183})`}}><canvas ref={canvasRef}/><div className="canvasTag">{projectName}<span>{type==="knit"?`BACKGROUND / ${backgroundTextures.find(item=>item.id===backgroundTextureKind)?.tag??"DENIM"}`:`${kind.toUpperCase()} / ${texture.toUpperCase()}`}</span></div></div></div>
        <div className="stageFooter"><div className="exportRatio"><span>导出预览比例 · {previewRatio}</span></div><div className="exportActions"><button onClick={exportSvg}>导出 SVG</button><button onClick={copyCss}>{saved?"✓ 已复制":"复制 CSS"}</button><button className="saveLibraryButton" onClick={saveToLibrary}>{libraryNotice?"✓ 已保存":"保存至「纹理库」"}</button><button className="exportPngButton" onClick={exportPng}>导出 PNG ↓</button></div></div>
      </section>
    </section>
  </main>;
}
