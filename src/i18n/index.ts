import { en } from './en';
import { zh } from './zh';

export type Language = 'en' | 'zh';

export const languages = {
    en,
    zh
};

export function getLanguage(lang: Language) {
    return languages[lang];
} 