// 流水线用的入口:打包成 pipeline/timeline/intro.bundle.js,合成页逐帧调用 window.FormIntro.draw(ctx, t, cfg)。
import { IntroFilm } from "./film";
(window as unknown as { FormIntro: IntroFilm }).FormIntro = new IntroFilm();
