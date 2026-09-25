import type { CustomCell } from "@specstory/ai-data-grid";

interface ArticleCellProps {
    readonly kind: "article-cell";
    readonly markdown: string;
}

export type ArticleCell = CustomCell<ArticleCellProps>;
