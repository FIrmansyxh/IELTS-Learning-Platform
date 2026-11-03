import { CONTRACT_VERSIONS } from '@/contracts/content';
import { withApi } from '@/server/http/withApi';
import { contractJsonSchema } from '@/server/import/templates';

export const dynamic = 'force-dynamic';

export const GET = withApi({ auth: 'admin' }, async () => ({
  data: { contract_version: CONTRACT_VERSIONS[CONTRACT_VERSIONS.length - 1], json_schema: contractJsonSchema() },
}));
