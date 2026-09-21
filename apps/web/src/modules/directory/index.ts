/** Public API of the directory module. Other code imports from here, never from the module's internals. */
export { createSearchDirectory } from "./application/search-directory";
export type {
  AlumniSummary,
  DirectoryPage,
  RateLimiter,
  SearchDirectory,
} from "./application/search-directory";
export {
  createListDepartments,
  createPostgresSearch,
} from "./infrastructure/postgres-search";
export { AlumniList } from "./presentation/ui/alumni-list";
export { DirectoryFilters } from "./presentation/ui/directory-filters";
