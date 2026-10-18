// Cosmetic-only, bounded schema shared by server, lobby, renderer and saved profiles.
export const AVATAR_MODELS = [
  { id:0, name:'Raka', role:'Street original', height:1, width:1, depth:1 },
  { id:1, name:'Kai', role:'City runner', height:1.03, width:.9, depth:.92 },
  { id:2, name:'Atlas', role:'Night rider', height:1.06, width:1.16, depth:1.08 },
  { id:3, name:'Naya', role:'District creative', height:.98, width:.92, depth:.9 },
  { id:4, name:'Luna', role:'Urban explorer', height:.94, width:.96, depth:.92 },
  { id:5, name:'Asha', role:'Neon nomad', height:1.04, width:1.02, depth:.96 },
];
export const SKIN = [0xf1c7a6,0xdeac86,0xc78b5d,0xa26943,0x754a32,0x513528,0xd8a17b];
export const HAIR = [0x171a20,0x38261f,0x684332,0xa97840,0xd5c29c,0x929ba4,0x522e60,0x893e32];
export const FABRIC = [0x263b51,0xe5ded1,0x22252c,0xb34442,0x3f6e61,0xc18b43,0x66618c,0x2a7c95,0x8b593f,0x85939e];
export const DENIM = [0x25354b,0x1b202a,0x69778b,0x465145,0x866951,0xc2b6a0,0x4b3546,0x3e3f48];
export const FOOTWEAR = [0xeeeeea,0x171b22,0x72513d,0x3f526a,0xa53e3c,0xc4b38e];
export const HAIR_STYLES = ['Crop','Side part','Textured','Long bob','Ponytail','Buzz','Bald','Curly'];
export const TOP_STYLES = ['T-shirt','Jacket','Hoodie','Overshirt','Vest'];
export const BOTTOM_STYLES = ['Jeans','Cargo','Shorts','Jogger'];
export const SHOE_STYLES = ['Sneakers','Boots','Street','Formal'];
export const ACCESSORIES = ['None','Glasses','Cap','Beanie'];
const KEYS = ['model','skin','hair','hairColor','top','topColor','bottom','bottomColor','shoes','shoeColor','accessory'];
const LIMITS = [AVATAR_MODELS.length,SKIN.length,HAIR_STYLES.length,HAIR.length,TOP_STYLES.length,FABRIC.length,BOTTOM_STYLES.length,DENIM.length,SHOE_STYLES.length,FOOTWEAR.length,ACCESSORIES.length];
export const DEFAULT_APPEARANCE = Object.freeze({model:0,skin:2,hair:1,hairColor:0,top:1,topColor:0,bottom:0,bottomColor:0,shoes:0,shoeColor:0,accessory:0});
export function sanitizeAppearance(raw, fallback = DEFAULT_APPEARANCE) {
  let value = raw;
  if (typeof raw === 'string') { try { value = JSON.parse(raw); } catch { value = null; } }
  const out = {};
  for (let i=0;i<KEYS.length;i++) {
    const key = KEYS[i], n = Array.isArray(value) ? value[i] : value?.[key];
    out[key] = Number.isInteger(n) && n>=0 && n<LIMITS[i] ? n : (fallback[key] ?? DEFAULT_APPEARANCE[key]);
  }
  return out;
}
export function packAppearance(value) { const a=sanitizeAppearance(value);return KEYS.map(k=>a[k]); }
export function appearanceKey(value) { return packAppearance(value).join('.'); }
export function avatarPalette(value) {
  const a=sanitizeAppearance(value);
  return {...a, skinColor:SKIN[a.skin], shirt:FABRIC[a.topColor], pants:DENIM[a.bottomColor], hairHex:HAIR[a.hairColor], shoeHex:FOOTWEAR[a.shoeColor]};
}
