/** 图片通过素材 id 引用。运行时素材和文章数据留在本机。 */
export interface ImageCategory { id: string; name: string; order: number }
export interface ImageAsset {
  id: string;
  label: string;
  src: string;
  categoryId: string;
  width?: number;
  height?: number;
  placeholder?: boolean;
}
export const DEFAULT_IMAGE_CATEGORIES: ImageCategory[] = [
  { id: 'sample', name: '示例素材', order: 1 },
  { id: 'covers', name: '封面与作品', order: 2 },
  { id: 'brand', name: '品牌与横幅', order: 3 },
  { id: 'uploads', name: '上传素材', order: 4 },
];
export function defaultImageLibrary(): ImageAsset[] {
  return [{ id: 'sample-cover', label: '开源示例插画', src: '/library/sample/cover.svg', categoryId: 'sample', width: 1200, height: 675 }];
}
export function imageIndex(assets: ImageAsset[]): Map<string, string> {
  return new Map(assets.filter((asset) => asset.src).map((asset) => [asset.id, asset.src]));
}
export function resolveImageRef(ref: string, index: Map<string, string>): string {
  const value = (ref ?? '').trim();
  if (!value) return '';
  if (value.startsWith('/') || value.startsWith('https://') || value.startsWith('http://') || value.startsWith('data:')) return value;
  return index.get(value) ?? value;
}
