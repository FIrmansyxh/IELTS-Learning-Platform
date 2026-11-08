import { tracksApi } from './tracks';

export const curriculumApi = {
  /** `track` opsional (SPEC-021); tanpa nilai = jalur aktif. `data.tiers` tidak berubah. */
  tree: async (signal?: AbortSignal, track: string | null = null) => tracksApi.tree(track, signal),
};
