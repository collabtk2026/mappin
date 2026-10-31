import { v7 } from 'uuid';
export const newId = (): string => v7();
/** categories.path ltree 라벨: uuid 하이픈 제거 */
export const ltreeLabel = (id: string): string => id.replaceAll('-', '');
