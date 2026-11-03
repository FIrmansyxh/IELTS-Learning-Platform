import type { Metadata } from 'next';
import { SubModulePlayer } from '@/components/player/sub-module-player';
import { parsePlayerQuery } from '@/components/player/query';
import { id } from '@/i18n/id';

export const metadata: Metadata = { title: id.player.tabs.learn };

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ sub_module_code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { sub_module_code: code } = await params;
  const initial = parsePlayerQuery(await searchParams);
  return <SubModulePlayer key={code} code={code} initial={initial} />;
}
