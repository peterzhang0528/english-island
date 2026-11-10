import storyChapters from "../public/game/story-chapters.json";

export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type ChapterInfo = { title: string; subtitle: string; description: string; steps: string[]; };
export const chapterNumbers: Level[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export function isLevel(value: unknown): value is Level { return typeof value === "number" && chapterNumbers.includes(value as Level); }
const numberNames = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
export const dayNames = Object.fromEntries(chapterNumbers.map(id => [id, `第${numberNames[id]}天`])) as Record<Level, string>;
export const chapters: Record<Level, ChapterInfo> = {
  1: { title: "第一把斧头", subtitle: "森林小匠人", description: "收集原木和石头，亲手做一把斧头。", steps: ["推开木门", "收集原木", "制作木棍", "寻找石头", "合成石斧", "砍倒大树"] },
  2: { title: "给僵尸做蛋糕", subtitle: "小岛烘焙师", description: "去夜晚的农场找食材，在暖灯下为朋友做蛋糕。", steps: ["认识新朋友", "寻找鸡蛋", "收集牛奶", "收割小麦", "制作蛋糕", "分享蛋糕"] },
  3: { title: "和新朋友种花园", subtitle: "小岛园艺师", description: "播下一颗种子，和小蜜蜂一起等花开。", steps: ["重逢新朋友", "松开泥土", "播下种子", "给种子浇水", "迎接阳光", "邀请小蜜蜂"] },
  ...Object.fromEntries(storyChapters.map(chapter => [chapter.id, {title: chapter.title, subtitle: chapter.subtitle, description: chapter.description, steps: ["故事接着开始", ...chapter.stages.map(stage => stage.label)]}]))
} as Record<Level, ChapterInfo>;
export function gamePath(level: Level): string { return level === 1 ? "/game/index.html" : level < 4 ? `/game/day${level}.html` : `/game/story.html?level=${level}`; }
