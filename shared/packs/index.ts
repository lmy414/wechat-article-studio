/**
 * 组件包登记处。
 *
 * 任何 import 到这个模块的地方，注册表都已经装好通用包与周刊包；
 * article.ts / render.ts 都依赖这个副作用，所以不要改成懒加载。
 */

import { registerComponents } from '../components';
import { basePack } from './base';
import { weeklyPack } from './weekly';

registerComponents([...basePack, ...weeklyPack]);

export { basePack, weeklyPack };
