import {
  CreateSimulationResponseSchema,
  SimulationOptionsResponseSchema,
  SimulationResultResponseSchema,
  SimulationSectionDetailResponseSchema,
  SimulationStateResponseSchema,
  SubmitSectionResponseSchema,
  type CreateSimulationRequest,
  type CreateSimulationResponse,
  type SimulationOptionsResponse,
  type SimulationResultResponse,
  type SimulationSection,
  type SimulationSectionDetailResponse,
  type SimulationStateResponse,
  type SubmitSectionResponse,
} from '@/contracts/simulation';
import { apiFetch } from './client';

export const simulationsApi = {
  getOptions: async (signal?: AbortSignal): Promise<SimulationOptionsResponse['data']> =>
    (await apiFetch('/simulations/options', { schema: SimulationOptionsResponseSchema, signal })).data,

  createSimulation: async (body: CreateSimulationRequest): Promise<CreateSimulationResponse['data']> =>
    (await apiFetch('/simulations', { method: 'POST', body, schema: CreateSimulationResponseSchema })).data,

  getSimulation: async (attemptId: string, signal?: AbortSignal): Promise<SimulationStateResponse['data']> =>
    (await apiFetch(`/simulations/${attemptId}`, { schema: SimulationStateResponseSchema, signal })).data,

  getSectionDetail: async (
    attemptId: string,
    section: SimulationSection,
    signal?: AbortSignal,
  ): Promise<SimulationSectionDetailResponse['data']> =>
    (
      await apiFetch(`/simulations/${attemptId}/sections/${section}`, {
        schema: SimulationSectionDetailResponseSchema,
        signal,
      })
    ).data,

  startSection: async (
    attemptId: string,
    section: SimulationSection,
  ): Promise<SimulationSectionDetailResponse['data']> =>
    (
      await apiFetch(`/simulations/${attemptId}/sections/${section}/start`, {
        method: 'POST',
        schema: SimulationSectionDetailResponseSchema,
      })
    ).data,

  submitSection: async (attemptId: string, section: SimulationSection): Promise<SubmitSectionResponse['data']> =>
    (
      await apiFetch(`/simulations/${attemptId}/sections/${section}/submit`, {
        method: 'POST',
        schema: SubmitSectionResponseSchema,
      })
    ).data,

  getResult: async (attemptId: string, signal?: AbortSignal): Promise<SimulationResultResponse['data']> =>
    (await apiFetch(`/simulations/${attemptId}/result`, { schema: SimulationResultResponseSchema, signal })).data,

  abandonSimulation: async (attemptId: string): Promise<void> => {
    await apiFetch(`/simulations/${attemptId}/abandon`, { method: 'POST' });
  },
};
