import gameRulesMd from "../docs/GAME_RULES.md?raw";
import { marked } from "marked";

export const GAME_RULES_MARKDOWN: string = gameRulesMd;

marked.setOptions({ gfm: true });
/** 彈窗已有 h2 標題，內文標題整體降一階（h2→h3、h3→h4）以利閱讀與無障礙。 */
marked.use({
  renderer: {
    heading(
      this: { parser: { parseInline: (tok: unknown) => string } },
      { tokens, depth }: { tokens: unknown; depth: number },
    ) {
      const d = Math.min(6, depth + 1);
      return `<h${d}>${this.parser.parseInline(tokens)}</h${d}>\n`;
    },
  },
});

/** 遊戲內彈窗用：給一般玩家的開場說明（非 Markdown）。 */
const PLAYER_INTRO_HTML = `<p class="rules-lead">\u6b61\u8fce\u95b1\u8b80\uff01\u4ee5\u4e0b\u5206\u6210\u5169\u5927\u5340\uff1a<strong>\u7167\u9867\u5bf5\u7269</strong>\u8207<strong>\u9023\u7dda\u5c0d\u6230</strong>\u3002\u91cd\u9ede\u5df2\u6574\u7406\u6210\u689d\u5217\u8207\u5c0d\u7167\u8868\uff0c\u65b9\u4fbf\u5feb\u901f\u67e5\u95b1\uff1b\u7d30\u7bc0\u8207\u6578\u5b57\u4ee5\u904a\u6232\u5167\u70ba\u6e96\u3002</p>`;

/**
 * 產生「遊戲說明」彈窗的 HTML：僅收錄養成與對戰（`## 一、`～`## 二、` 全文），
 * 不含維護者專用的第三節以後。來源仍為 `docs/GAME_RULES.md`。
 */
export function getGameRulesPlayerHtml(): string {
  const all = gameRulesMd;
  const maintainerIdx = all.indexOf("\n## \u4e09\u3001");
  const careAndBattle =
    maintainerIdx >= 0 ? all.slice(0, maintainerIdx) : all;
  const section1Idx = careAndBattle.indexOf("\n## \u4e00\u3001");
  const bodyMd =
    section1Idx >= 0
      ? careAndBattle.slice(section1Idx + 1).trimStart()
      : careAndBattle.trim();
  let html = marked(bodyMd) as string;
  html = html
    .replaceAll("<table>", '<div class="table-wrap"><table>')
    .replaceAll("</table>", "</table></div>");
  return PLAYER_INTRO_HTML + html;
}
