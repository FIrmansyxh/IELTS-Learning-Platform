import { z } from 'zod';
import { Uuid } from '@/contracts/common';
import { getDb } from '@/server/db';
import { ApiError, validationError } from '@/server/http/errors';
import { readMultipart } from '@/server/http/multipart';
import { withApi } from '@/server/http/withApi';
import { zodDetails } from '@/server/http/zod-errors';
import { createSpeakingSubmission } from '@/server/ai/service';
import { UPLOAD_MAX_BYTES_RECORDING } from '@/server/ai/audio';

export const dynamic = 'force-dynamic';

const CreateSpeakingFieldsSchema = z.strictObject({
  kind: z.enum(['SPEAKING_PART1', 'SPEAKING_PART2', 'SPEAKING_PART3', 'MINI_TASK_SPEAKING']),
  attempt_id: Uuid.optional(),
  question_id: z.string().min(1).max(40).optional(),
  sub_module_id: Uuid.optional(),
  duration_sec: z.coerce.number().int().min(0).max(180).optional(),
});

export const POST = withApi(
  {
    auth: 'user',
    raw: true,
    rateLimit: [{ bucket: 'upload_recording', key: 'user' }],
  },
  async ({ req, user }) => {
    const mp = await readMultipart(req, { maxBytes: UPLOAD_MAX_BYTES_RECORDING });
    const audioFiles = mp.files.filter((f) => f.name === 'audio');

    if (mp.files.length > audioFiles.length) {
      throw validationError(mp.files.find((f) => f.name !== 'audio')!.name, 'unrecognized_key');
    }
    if (audioFiles.length === 0) {
      throw validationError('audio', 'audio_required');
    }
    if (audioFiles.length > 1) {
      throw validationError('audio', 'multiple_audio_parts');
    }

    const parsed = CreateSpeakingFieldsSchema.safeParse(mp.fields);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', { details: zodDetails(parsed.error) });
    }

    const file = audioFiles[0]!.file;
    const audioBuffer = Buffer.from(await file.arrayBuffer());

    const result = await createSpeakingSubmission(getDb(), user!.id, parsed.data, audioBuffer);
    return {
      status: 202,
      data: result,
    };
  },
);
