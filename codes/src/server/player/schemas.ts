import { z } from 'zod';
import { Uuid } from '@/contracts/common';

/**
 * Folder rute memakai satu nama segmen dinamis `[sub_module]` (Next melarang `[sub_module_code]` dan
 * `[sub_module_id]` berdampingan pada level yang sama); path publik kontrak tetap sama.
 *
 * Catatan spec: regex tertulis `^[1-4]\.\d{1,2}\.\d{1,2}$`, tetapi AC menyebut `9.9.9` "format valid, tidak ada" -> 404.
 * Segmen tier dilonggarkan ke satu digit sehingga kode tak dikenal -> 404 dan non-kode (`abc`) -> 400.
 */
export const SubModuleCodeParamSchema = z.strictObject({ sub_module: z.string().regex(/^\d\.\d{1,2}\.\d{1,2}$/, { message: 'invalid_format' }) });
export const SubModuleIdParamSchema = z.strictObject({ sub_module: Uuid });
export const AssetIdParamSchema = z.strictObject({ asset_id: Uuid });
