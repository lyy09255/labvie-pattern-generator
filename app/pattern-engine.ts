export type PatternKind = "plaid" | "diagonal-plaid" | "stripe" | "polka-dot";
export type TextureKind = "plain" | "twill" | "herringbone" | "linen" | "cross-hatch" | "noise-fiber";
export type BlendMode = "multiply" | "overlay" | "screen" | "source-over";
export type DotShape = "circle" | "star" | "heart" | "drop" | "custom";
export type BandRole = "halo" | "main" | "secondary" | "accent";
export type BandSpec = { width:number;color:string;opacity?:number;offset?:number };
export type BandGroups = { main:BandSpec[];secondary:BandSpec[];accent:BandSpec[] };
export type StripeLayer = { color:string; width:number; opacity:number; offset:number; repeat:number; blendMode:BlendMode; texture:TextureKind; role:BandRole };
export type DiagonalSegment = { id:string; color:string; width:number; opacity:number; gapAfter:number; blendMode:BlendMode; textureOpacity:number };
export type DiagonalSystem = { angle:number; offset:number; period:number; segments:DiagonalSegment[]; blendMode:BlendMode };
export type FabricTexture = { kind:TextureKind; angle:number; density:number; lineWidth:number; opacity:number; strength:number; lightColor:string; darkColor:string };
export type DiagonalConfig = { background:string; cell:number; axisAligned?:boolean; rasterScale?:number; positive:DiagonalSystem; negative:DiagonalSystem; fabric:FabricTexture };
export type PatternProject = { kind:PatternKind; tile:{width:number;height:number}; sourceTile:number; background:string; rotation:number; weave:{threadWidth:number;segmentLength:number;threadGap:number}; warp:StripeLayer[]; weft:StripeLayer[]; intersection:{solidMain:boolean;color:string;opacity:number}; texture:{kind:TextureKind;strength:number;scale:number;lightColor:string;darkColor:string}; diagonal?:DiagonalConfig; dots?:{shape:DotShape;radius:number;starPoints:number;gapX:number;gapY:number;offsetX:number;offsetY:number;rowOffset:number;color:string;opacity:number;alternateColor:string;alternateOpacity:number;customImage?:HTMLImageElement|null} };
export interface PatternRenderer { readonly kind:PatternKind; render(project:PatternProject, target:CanvasRenderingContext2D):void }

const TAU=Math.PI*2;
const customDotMaskCache=new WeakMap<HTMLImageElement,Map<string,HTMLCanvasElement>>();
function layerCanvas(width:number,height:number){const c=document.createElement("canvas");c.width=width;c.height=height;return c}
function line(ctx:CanvasRenderingContext2D,x1:number,y1:number,x2:number,y2:number,color:string,alpha:number,width:number){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.globalAlpha=alpha;ctx.lineWidth=width;ctx.stroke()}
function getSharpContext(canvas:HTMLCanvasElement){const ctx=canvas.getContext("2d")!;ctx.imageSmoothingEnabled=false;return ctx}
function clipBand(ctx:CanvasRenderingContext2D,axis:"warp"|"weft",start:number,width:number,length:number){
  ctx.beginPath();
  if(axis==="warp")ctx.rect(start,0,width,length);
  else ctx.rect(0,start,length,width);
  ctx.clip();
}
function hatchBand(ctx:CanvasRenderingContext2D,color:string,alpha:number,step:number,size:number,width:number,height:number){
  ctx.save();
  ctx.strokeStyle=color;
  ctx.globalAlpha=alpha;
  ctx.lineWidth=size;
  for(let d=-height;d<width+height;d+=step){
    ctx.beginPath();
    ctx.moveTo(d,height);
    ctx.lineTo(d+height,0);
    ctx.stroke();
  }
  ctx.restore();
}
function fillBandRect(ctx:CanvasRenderingContext2D,axis:"warp"|"weft",start:number,width:number,W:number,H:number){
  if(axis==="warp")ctx.fillRect(start,0,width,H);
  else ctx.fillRect(0,start,W,width);
}
function shouldHatch(role:BandRole,axis:"warp"|"weft"){return role==="main"&&axis==="warp"}
function drawSegmentTexture(ctx:CanvasRenderingContext2D,segment:DiagonalSegment,fabric:FabricTexture,W:number,H:number){
  if(segment.textureOpacity<=0)return;
  hatchBand(ctx,fabric.lightColor,segment.textureOpacity,Math.max(4,fabric.density),Math.max(.9,fabric.lineWidth),W,H);
}
function mod(n:number,m:number){return((n%m)+m)%m}
function clamp01(n:number){return Math.max(0,Math.min(1,n))}
function mixHex(a:string,b:string,t:number){
  const pa=parseInt((a||"#000000").slice(1),16),pb=parseInt((b||"#000000").slice(1),16);
  const ar=(pa>>16)&255,ag=(pa>>8)&255,ab=pa&255,br=(pb>>16)&255,bg=(pb>>8)&255,bb=pb&255,u=clamp01(t);
  const r=Math.round(ar+(br-ar)*u),g=Math.round(ag+(bg-ag)*u),bl=Math.round(ab+(bb-ab)*u);
  return `#${[r,g,bl].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
}
function buildDiagonalStripeLayers(colors:string[],spacing:number,width:number,secondaryWidth:number,accentWidth:number,opacity:number,bands?:BandGroups){
  const main=colors[1]||"#A67A55", secondary=colors[2]||"#FEFFD5", accent=colors[3]||"#EDA5B4";
  const secondaryGroups=bands?bands.secondary:[{width:secondaryWidth,color:secondary,opacity:100}];
  const extraAccent=(bands?.accent||[]).slice(1);
  const buildAxisLayers=(mainOffset:number)=>{
    const center=mainOffset+(width/2);
    const mainHalf=width/2;

    // Keep every auxiliary band completely outside the main band. Previously
    // these offsets overlapped the main band and visually split one brown band
    // into two parallel rails.
    // Keep a single fine line halfway between consecutive main bands. There is
    // one secondary pair on each side of the main band for every group.
    const group2Center=center+(spacing/2);
    const group2Accent=group2Center-Math.round(accentWidth/2);

    const layers:StripeLayer[]=[
      {color:main,width,opacity:1,offset:mainOffset,repeat:spacing,blendMode:"source-over",texture:"plain",role:"main"},
    ];
    let distance=mainHalf;
    secondaryGroups.forEach((band)=>{
      const bandWidth=Math.max(4,band.width);
      distance+=Math.max(0,band.offset??0);
      layers.push(
        {color:band.color,width:bandWidth,opacity:1,offset:center-distance-bandWidth,repeat:spacing,blendMode:"source-over",texture:"plain",role:"secondary"},
        {color:band.color,width:bandWidth,opacity:1,offset:center+distance,repeat:spacing,blendMode:"source-over",texture:"plain",role:"secondary"},
      );
      distance+=bandWidth;
    });
    layers.push({color:accent,width:Math.max(1,accentWidth),opacity:1,offset:group2Accent,repeat:spacing,blendMode:"source-over",texture:"plain",role:"accent"});
    return layers;
  };
  const mainOffset=Math.round((spacing-width)/2);
  const warp:StripeLayer[]=buildAxisLayers(mainOffset);
  const weft:StripeLayer[]=buildAxisLayers(mainOffset);
  extraAccent.forEach((band,idx)=>{
    const extraOffset=Math.round(spacing*(.28+idx*.08));
    warp.push({color:band.color,width:band.width,opacity:1,offset:extraOffset,repeat:spacing,blendMode:"source-over",texture:"plain",role:"accent"});
    weft.push({color:band.color,width:band.width,opacity:1,offset:extraOffset,repeat:spacing,blendMode:"source-over",texture:"plain",role:"accent"});
  });
  return{warp,weft}
}
function diagonalLayerProfile(layers:StripeLayer[],coord:number){
  let picked:{layer:StripeLayer;local:number;order:number}|null=null;
  layers.forEach((layer,order)=>{
    const repeat=Math.max(1,layer.repeat);
    const local=mod(coord-layer.offset,repeat);
    if(local>=0&&local<layer.width&&layer.opacity>0){
      picked={layer,local,order};
    }
  });
  return picked;
}
function applyTextureLine(base:number,target:number,alpha:number){return Math.round(base*(1-alpha)+target*alpha)}
function hatchMask(axisValue:number,linePeriod:number,lineWidth:number){
  return mod(axisValue,linePeriod)<lineWidth;
}
function crossingFill(
  first:StripeLayer,
  second:StripeLayer,
){
  const byRole=(role:BandRole)=>{
    if(first.role===role)return first;
    if(second.role===role)return second;
    return null;
  };
  const main=byRole("main");
  const secondary=byRole("secondary");
  const accent=byRole("accent");

  // Every unlike crossing has exactly one opaque base colour and one hatch
  // colour. This explicit table prevents two hatch systems from being drawn
  // over each other:
  // main × secondary -> secondary base + main hatch
  // main × accent    -> accent base + main hatch
  // secondary × accent -> secondary base + accent hatch
  if(main&&secondary)return{base:secondary,hatch:main};
  if(main&&accent)return{base:accent,hatch:main};
  if(secondary&&accent)return{base:secondary,hatch:accent};

  // Halo is not currently used by plaid, but keeping a deterministic fallback
  // makes future layer additions render as one clean base/hatch pair as well.
  return{base:second,hatch:first};
}
function paintDiagonalTile(project:PatternProject,target:CanvasRenderingContext2D){
  const diagonal=project.diagonal!;
  const {width:W,height:H}=project.tile;
  const image=target.createImageData(W,H);
  const bg=diagonal.background;
  // Keep the twill phase continuous across the entire output. Deriving rows
  // from the tile height made a 201px repeat alternate between 8px and 9px
  // gaps, which turned into faint horizontal/vertical bands after scaling.
  const rasterScale=diagonal.rasterScale??1;
  const nominalTexturePeriod=Math.max(2,8*rasterScale);
  const textureRepeats=Math.max(1,Math.round(diagonal.cell/nominalTexturePeriod));
  const texturePeriod=diagonal.cell/textureRepeats;
  const textureWidth=texturePeriod/2;
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      // The regular and diagonal tabs share the exact same stripe-layer
      // renderer. Regular plaid is the same system rotated by 45 degrees:
      // x/y coordinates produce horizontal and vertical bands, while x+y/x-y
      // produce the two diagonal directions.
      const u=mod(diagonal.axisAligned?x:x+y,diagonal.cell);
      const v=mod(diagonal.axisAligned?y:x-y,diagonal.cell);
      const pos=diagonalLayerProfile(project.warp,u);
      const neg=diagonalLayerProfile(project.weft,v);
      let color=bg;
      const hasPos=!!pos;
      const hasNeg=!!neg;
      const posLayer=pos?.layer;
      const negLayer=neg?.layer;
      const isPureCross=!!(
        posLayer&&
        negLayer&&
        posLayer.role===negLayer.role&&
        (posLayer.role==="main"||posLayer.role==="secondary"||posLayer.role==="accent")
      );
      if(isPureCross){
        const pureColor=posLayer!.color===negLayer!.color
          ? posLayer!.color
          : mixHex(posLayer!.color,negLayer!.color,.5);
        color=pureColor;
      }else if(hasPos||hasNeg){
        // A plaid band is made only from opaque colour lines. There is no
        // translucent rectangle beneath them: the gaps reveal the background.
        const textureY=diagonal.axisAligned?x+y:y;
        const onLine=mod(textureY,texturePeriod)<textureWidth;
        if(hasPos&&hasNeg){
          const crossing=crossingFill(posLayer!,negLayer!);
          color=onLine?crossing.hatch.color:crossing.base.color;
        }else if(onLine){
          color=(posLayer||negLayer)!.color;
        }else{
          color=bg;
        }
      }

      const value=parseInt(color.slice(1),16);
      const r=(value>>16)&255,g=(value>>8)&255,b=value&255;
      const i=(y*W+x)*4;
      image.data[i]=r;
      image.data[i+1]=g;
      image.data[i+2]=b;
      image.data[i+3]=255;
    }
  }
  target.putImageData(image,0,0);
}
function weaveLayers(project:PatternProject,layers:StripeLayer[],axis:"warp"|"weft",phase=0,width=project.tile.width,height=project.tile.height){
  const c=layerCanvas(width,height),ctx=getSharpContext(c),W=c.width,H=c.height;
  layers.forEach((l,li)=>{ctx.globalCompositeOperation=l.blendMode;const repeat=Math.max(2,l.repeat),span=axis==="warp"?W:H,depth=axis==="warp"?H:W;
    for(let band=l.offset%repeat-repeat;band<span+repeat;band+=repeat){
      const start=Math.round(band),bandWidth=Math.max(1,Math.round(l.width));
      ctx.save();
      clipBand(ctx,axis,start,bandWidth,depth);
      ctx.fillStyle=l.color;
      ctx.globalAlpha=Math.min(1,l.opacity*(l.role==="halo"?.28:.98));
      fillBandRect(ctx,axis,start,bandWidth,W,H);
      if(shouldHatch(l.role,axis)){
        const hatchColor="rgba(255,255,255,.95)";
        const hatchAlpha=.82;
        const hatchStep=Math.max(9,project.weave.segmentLength);
        hatchBand(ctx,hatchColor,hatchAlpha,hatchStep,Math.max(2,project.weave.threadWidth*1.2),W,H);
      }
      ctx.restore();
    }
  });ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";return c
}

function solidMainIntersections(project:PatternProject,width:number,height:number){const c=layerCanvas(width,height),ctx=getSharpContext(c),warps=project.warp.filter(l=>l.role==="main"),wefts=project.weft.filter(l=>l.role==="main");if(!project.intersection.solidMain)return c;ctx.globalAlpha=project.intersection.opacity;for(const warp of warps)for(const weft of wefts){ctx.fillStyle=warp.color;for(let x=warp.offset-warp.repeat;x<width+warp.repeat;x+=warp.repeat)for(let y=weft.offset-weft.repeat;y<height+weft.repeat;y+=weft.repeat){ctx.beginPath();ctx.rect(Math.round(x),Math.round(y),Math.round(warp.width),Math.round(weft.width));ctx.fill()}}ctx.globalAlpha=1;return c}

export class TextureEngine{
  render(project:PatternProject,ctx:CanvasRenderingContext2D){const {width:W,height:H}=project.tile,{kind,strength,scale,lightColor,darkColor}=project.texture;if(strength<=0)return;ctx.save();ctx.globalAlpha=strength;ctx.globalCompositeOperation="overlay";
    const step=Math.max(3,scale);if(kind==="plain"){for(let y=.5;y<H;y+=step)line(ctx,0,y,W,y,lightColor,.6,.45)}
    if(kind==="twill")for(let d=-H;d<W;d+=step*1.6)line(ctx,d,H,d+H,0,lightColor,.45,.5);
    if(kind==="herringbone")for(let x=-W;x<W*2;x+=step*4){line(ctx,x,0,x+step*2,H/2,lightColor,.75,.65);line(ctx,x+step*2,H/2,x,H,lightColor,.75,.65)}
    if(kind==="linen"){for(let x=.5;x<W;x+=step*1.7)line(ctx,x,0,x,H,lightColor,.55,.45);for(let y=.5;y<H;y+=step)line(ctx,0,y,W,y,darkColor,.28,.4)}
    if(kind==="cross-hatch"){for(let d=-H;d<W;d+=step){line(ctx,d,H,d+H,0,lightColor,.55,.45);line(ctx,d,0,d+H,H,darkColor,.28,.45)}}
    if(kind==="noise-fiber"){let seed=2166136261;const rnd=()=>((seed=Math.imul(seed^seed>>>15,2246822519))>>>0)/4294967295;for(let i=0;i<W*H/180;i++){const x=rnd()*W,y=rnd()*H;line(ctx,x,y,x+rnd()*scale*3,y+(rnd()-.5)*2,lightColor,.6,.35)}}ctx.restore()
  }
}

class DiagonalRenderer implements PatternRenderer{
  constructor(readonly kind:"plaid"|"diagonal-plaid"){}
  render(project:PatternProject,target:CanvasRenderingContext2D){
    paintDiagonalTile(project,target);
  }
}

class WovenRenderer implements PatternRenderer{
  constructor(public readonly kind:PatternKind,private warpOnly=false){}
  render(project:PatternProject,target:CanvasRenderingContext2D){const {width:W,height:H}=project.tile;
    const stripeMain=project.kind==="stripe"?project.warp.find(layer=>layer.role==="main"):undefined;
    // For stripes, tile width = main width + requested clear gap. When both
    // are equal the gap is exactly zero, so paint one solid main-colour tile.
    // This avoids any generic layer alpha or raster rounding introducing seams.
    if(stripeMain&&W<=stripeMain.width){
      target.fillStyle=project.background;
      target.fillRect(0,0,W,H);
      target.save();
      target.globalAlpha=stripeMain.opacity;
      target.fillStyle=stripeMain.color;
      target.fillRect(0,0,W,H);
      target.restore();
      return;
    }
    const pad=project.rotation?Math.ceil(Math.max(W,H)*.75):0,bigW=W+pad*2,bigH=H+pad*2;target.fillStyle=project.background;target.fillRect(0,0,W,H);const warp=weaveLayers(project,project.warp,"warp",0,bigW,bigH);const weft=this.warpOnly?null:weaveLayers(project,project.weft,"weft",1,bigW,bigH);
    target.save();target.translate(W/2,H/2);if(project.rotation)target.rotate(project.rotation*Math.PI/180);target.translate(-bigW/2,-bigH/2);target.globalCompositeOperation="source-over";target.drawImage(warp,0,0);if(weft){target.globalCompositeOperation="multiply";target.drawImage(weft,0,0)}target.restore();if(project.kind==="stripe"||project.kind==="polka-dot")new TextureEngine().render(project,target);if(weft){const solid=solidMainIntersections(project,bigW,bigH);target.save();target.translate(W/2,H/2);if(project.rotation)target.rotate(project.rotation*Math.PI/180);target.translate(-bigW/2,-bigH/2);target.globalCompositeOperation="source-over";target.globalAlpha=1;target.drawImage(solid,0,0);target.restore()}}
}
function drawDotShape(ctx:CanvasRenderingContext2D,shape:DotShape,x:number,y:number,r:number,starPoints=5,customImage?:HTMLImageElement|null){
  if(shape==="custom"&&customImage){
    const sourceWidth=customImage.naturalWidth||customImage.width||1;
    const sourceHeight=customImage.naturalHeight||customImage.height||1;
    const aspect=sourceWidth/sourceHeight;
    const drawWidth=aspect>=1?r*2:r*2*aspect;
    const drawHeight=aspect>=1?r*2/aspect:r*2;
    // Recolour the uploaded transparent artwork as a mask. A large temporary
    // surface keeps PNG edges clean and lets SVG remain sharp at export scale.
    const maskLongEdge=1024;
    const maskWidth=Math.max(1,Math.round(aspect>=1?maskLongEdge:maskLongEdge*aspect));
    const maskHeight=Math.max(1,Math.round(aspect>=1?maskLongEdge/aspect:maskLongEdge));
    const tint=String(ctx.fillStyle);
    let masks=customDotMaskCache.get(customImage);
    if(!masks){masks=new Map();customDotMaskCache.set(customImage,masks)}
    let mask=masks.get(tint);
    if(!mask){
      mask=layerCanvas(maskWidth,maskHeight);
      const maskCtx=mask.getContext("2d")!;
      maskCtx.imageSmoothingEnabled=true;
      maskCtx.imageSmoothingQuality="high";
      maskCtx.drawImage(customImage,0,0,maskWidth,maskHeight);
      maskCtx.globalCompositeOperation="source-in";
      maskCtx.fillStyle=tint;
      maskCtx.fillRect(0,0,maskWidth,maskHeight);
      masks.set(tint,mask);
    }
    ctx.drawImage(mask,x-drawWidth/2,y-drawHeight/2,drawWidth,drawHeight);
    return;
  }
  ctx.save();
  ctx.translate(x,y);
  ctx.beginPath();
  if(shape==="circle"){
    ctx.arc(0,0,r,0,TAU);
  }else if(shape==="star"){
    const points=Math.max(3,Math.round(starPoints));
    for(let i=0;i<points*2;i++){
      const angle=-Math.PI/2+i*Math.PI/points;
      const radius=i%2===0?r:r*.44;
      const px=Math.cos(angle)*radius,py=Math.sin(angle)*radius;
      if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    ctx.closePath();
  }else if(shape==="heart"){
    ctx.moveTo(0,r*.82);
    ctx.bezierCurveTo(-r*.18,r*.5,-r,-r*.05,-r,-r*.48);
    ctx.bezierCurveTo(-r,-r*1.02,-r*.28,-r*1.12,0,-r*.55);
    ctx.bezierCurveTo(r*.28,-r*1.12,r,-r*1.02,r,-r*.48);
    ctx.bezierCurveTo(r,-r*.05,r*.18,r*.5,0,r*.82);
  }else{
    ctx.moveTo(0,-r*1.15);
    ctx.bezierCurveTo(r*.22,-r*.72,r*.82,-r*.18,r*.82,r*.34);
    ctx.bezierCurveTo(r*.82,r*.9,r*.43,r*1.15,0,r*1.15);
    ctx.bezierCurveTo(-r*.43,r*1.15,-r*.82,r*.9,-r*.82,r*.34);
    ctx.bezierCurveTo(-r*.82,-r*.18,-r*.22,-r*.72,0,-r*1.15);
  }
  ctx.fill();
  ctx.restore();
}
class DotRenderer implements PatternRenderer{
  readonly kind="polka-dot" as const;
  render(p:PatternProject,ctx:CanvasRenderingContext2D){
    const d=p.dots!;
    ctx.fillStyle=p.background;
    ctx.fillRect(0,0,p.tile.width,p.tile.height);
    // A seamless tile contains two rows. The second row has its own horizontal
    // offset, so the default half-period value centres it in the row above.
    for(let row=-1;row<=2;row++){
      const y=d.offsetY+row*d.gapY;
      const alternate=mod(row,2)===1;
      const shift=alternate?d.rowOffset:0;
      ctx.globalAlpha=alternate?d.alternateOpacity:d.opacity;
      ctx.fillStyle=alternate?d.alternateColor:d.color;
      for(let x=d.offsetX+shift-d.gapX;x<p.tile.width+d.gapX;x+=d.gapX){
        drawDotShape(ctx,d.shape,x,y,d.radius,d.starPoints,d.customImage);
      }
    }
    ctx.globalAlpha=1;
    new TextureEngine().render(p,ctx);
  }
}
const renderers:Record<PatternKind,PatternRenderer>={plaid:new DiagonalRenderer("plaid"),"diagonal-plaid":new DiagonalRenderer("diagonal-plaid"),stripe:new WovenRenderer("stripe",true),"polka-dot":new DotRenderer()};
export function renderPattern(project:PatternProject,scale=1){
  const safeScale=Math.max(1,Math.round(scale));
  if(project.kind==="diagonal-plaid"||project.kind==="plaid"){
    const base=layerCanvas(project.tile.width,project.tile.height);
    const baseCtx=getSharpContext(base);
    renderers[project.kind].render(project,baseCtx);
    if(safeScale===1)return base;
    const scaled=layerCanvas(project.tile.width*safeScale,project.tile.height*safeScale);
    const scaledCtx=getSharpContext(scaled);
    scaledCtx.drawImage(base,0,0,scaled.width,scaled.height);
    return scaled;
  }
  const c=document.createElement("canvas");
  c.width=project.tile.width*safeScale;
  c.height=project.tile.height*safeScale;
  const ctx=getSharpContext(c);
  ctx.scale(safeScale,safeScale);
  renderers[project.kind].render(project,ctx);
  return c
}
export function renderPlaidField(project:PatternProject,width:number,height:number,repeatSize:number){
  const canvas=layerCanvas(Math.max(1,Math.round(width)),Math.max(1,Math.round(height)));
  if((project.kind!=="plaid"&&project.kind!=="diagonal-plaid")||!project.diagonal)return canvas;
  const cell=Math.max(1,Math.round(repeatSize));
  const factor=cell/project.sourceTile;
  const scaleLayers=(layers:StripeLayer[])=>layers.map(layer=>({
    ...layer,
    width:layer.width*factor,
    offset:layer.offset*factor,
    repeat:cell,
  }));
  const scaledProject:PatternProject={
    ...project,
    tile:{width:cell,height:cell},
    sourceTile:cell,
    warp:scaleLayers(project.warp),
    weft:scaleLayers(project.weft),
    diagonal:{...project.diagonal,cell,rasterScale:factor},
  };
  const tile=layerCanvas(cell,cell);
  renderers[project.kind].render(scaledProject,getSharpContext(tile));
  const ctx=getSharpContext(canvas);
  ctx.fillStyle=ctx.createPattern(tile,"repeat")!;
  ctx.fillRect(0,0,canvas.width,canvas.height);
  return canvas;
}
export function createProject(kind:PatternKind,colors:string[],spacing:number,width:number,opacity:number,dot:number,texture:TextureKind="twill",secondaryWidth=Math.max(5,width*.55),accentWidth=Math.max(1,width*.14),bands?:BandGroups):PatternProject{
  const sourceTile=kind==="stripe"?Math.max(1,spacing):Math.max(40,spacing),tile=sourceTile,c=(i:number)=>colors[i]||colors[colors.length-1]||colors[0],rawGroups=bands||{main:[{width,color:c(1)}],secondary:[{width:secondaryWidth,color:c(2)}],accent:[{width:accentWidth,color:c(3)}]},groups={main:[rawGroups.main[0]||{width,color:c(1)}],secondary:rawGroups.secondary,accent:rawGroups.accent},make=(color:string,w:number,offset:number,role:BandRole,alpha=opacity/100,blendMode:BlendMode="multiply"):StripeLayer=>({color,width:w,opacity:alpha,offset,repeat:sourceTile,blendMode,texture,role});
  const isPlaid=kind==="diagonal-plaid"||kind==="plaid";
  if(isPlaid){
    const diagonalLayers=buildDiagonalStripeLayers(colors,sourceTile,width,secondaryWidth,accentWidth,opacity,bands);
    return{
      kind,
      tile:{width:tile,height:tile},
      sourceTile,
      background:colors[0],
      rotation:0,
      weave:{threadWidth:1.2,segmentLength:10,threadGap:3.2},
      warp:diagonalLayers.warp,
      weft:diagonalLayers.weft,
      intersection:{solidMain:true,color:c(1),opacity:1},
      texture:{kind:"plain",strength:0,scale:4,lightColor:"#ffffff",darkColor:"#111111"},
      diagonal:{
        background:colors[0],
        cell:sourceTile,
        axisAligned:kind==="plaid",
        positive:{angle:45,offset:0,period:sourceTile,segments:[],blendMode:"multiply"},
        negative:{angle:-45,offset:0,period:sourceTile,segments:[],blendMode:"source-over"},
        fabric:{kind:"linen",angle:45,density:4,lineWidth:1,opacity:.18,strength:.72,lightColor:"#FFF7EA",darkColor:"#7B644E"},
      },
      dots:{shape:"circle",radius:dot,starPoints:5,gapX:spacing,gapY:spacing,offsetX:0,offsetY:0,rowOffset:spacing/2,color:colors[1]||colors[0],opacity:opacity/100,alternateColor:colors[2]||colors[1]||colors[0],alternateOpacity:opacity/100}
    }
  }
  if(kind==="stripe"){
    const mainBand=groups.main[0];
    const center=sourceTile/2;
    const mainOffset=center-mainBand.width/2;
    const warp:StripeLayer[]=[make(mainBand.color,mainBand.width,mainOffset,"main",(mainBand.opacity??100)/100,"multiply")];
    const hasOpenGap=sourceTile>mainBand.width;
    let distance=mainBand.width/2;
    if(hasOpenGap)groups.secondary.forEach(band=>{
      const bandWidth=Math.max(4,band.width);
      distance+=Math.max(0,band.offset??0);
      const bandAlpha=(band.opacity??100)/100;
      warp.push(
        make(band.color,bandWidth,center-distance-bandWidth,"secondary",bandAlpha,"source-over"),
        make(band.color,bandWidth,center+distance,"secondary",bandAlpha,"source-over"),
      );
      distance+=bandWidth;
    });
    if(hasOpenGap)groups.accent.forEach((band,index)=>{
      const base=center+sourceTile/2-band.width/2;
      warp.push(make(band.color,Math.max(1,band.width),base+(band.offset??0)+index*12,"accent",(band.opacity??100)/100,"overlay"));
    });
    return{kind,tile:{width:tile,height:tile},sourceTile,background:colors[0],rotation:0,weave:{threadWidth:1.6,segmentLength:9,threadGap:2.8},warp,weft:[],intersection:{solidMain:false,color:c(1),opacity:1},texture:{kind:"plain",strength:0,scale:4,lightColor:"#ffffff",darkColor:"#111111"},dots:{shape:"circle",radius:dot,starPoints:5,gapX:spacing,gapY:spacing,offsetX:0,offsetY:0,rowOffset:spacing/2,color:colors[1]||colors[0],opacity:opacity/100,alternateColor:colors[2]||colors[1]||colors[0],alternateOpacity:opacity/100}}
  }
  const build=(axis:"warp"|"weft")=>{const layers:StripeLayer[]=[];groups.main.forEach((b,i)=>{const offset=axis==="warp"?0:sourceTile*.5;const halo=Math.max(2,b.width*.12);layers.push(make(b.color,b.width+halo*2,offset-halo,"halo",Math.min(.12,opacity/100*.16),"source-over"),make(b.color,b.width,offset,"main"))});if(axis==="warp"){groups.secondary.forEach((b,i)=>layers.push(make(b.color,b.width,sourceTile*(.28+i*.22),"secondary")));groups.accent.forEach((b,i)=>layers.push(make(b.color,b.width,sourceTile*(.62+i*.2),"accent",Math.min(.65,opacity/100),"overlay")))}else{groups.secondary.slice(0,1).forEach((b,i)=>layers.push(make(b.color,b.width,sourceTile*(.72+i*.18),"secondary",Math.min(.32,opacity/100*.45),"source-over")))}return layers};
  const warp=build("warp"),weft=build("weft");
  return{kind,tile:{width:tile,height:tile},sourceTile,background:colors[0],rotation:0,weave:{threadWidth:1.6,segmentLength:9,threadGap:2.8},warp,weft,intersection:{solidMain:true,color:c(1),opacity:1},texture:{kind:"plain",strength:0,scale:4,lightColor:"#ffffff",darkColor:"#111111"},dots:{shape:"circle",radius:dot,starPoints:5,gapX:spacing,gapY:spacing,offsetX:0,offsetY:0,rowOffset:spacing/2,color:colors[1]||colors[0],opacity:opacity/100,alternateColor:colors[2]||colors[1]||colors[0],alternateOpacity:opacity/100}}
}
