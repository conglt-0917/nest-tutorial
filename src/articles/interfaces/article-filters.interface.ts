export interface ArticleFilters {
  authorId?: string;
  favoritedBy?: string;
}

export interface Pagination {
  limit: number;
  offset: number;
}
