'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Edit2,
  FileText,
  Folder,
  Layers,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { ContentStatus } from '@/contracts/curation';
import { id } from '@/i18n/id';
import { curationApi } from '@/lib/api/curation';
import { apiErrorMessage } from '@/lib/api/errors';

type SubModuleItem = {
  id: string;
  title: string;
  order_index: number;
  status: ContentStatus;
  content_version: number;
  passing_score_percent: number;
  origin?: string;
  is_blocked?: boolean;
  blocker_reason?: string;
};

type ModuleItem = {
  id: string;
  title: string;
  order_index: number;
  status: ContentStatus;
  content_version: number;
  is_blocked?: boolean;
  blocker_reason?: string;
  sub_modules: SubModuleItem[];
};

type TierItem = {
  tier_number: number;
  tier_name: string;
  modules: ModuleItem[];
};

export function StatusBadge({ status }: { status: ContentStatus }) {
  switch (status) {
    case 'PUBLISHED':
      return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">{status}</Badge>;
    case 'APPROVED':
      return <Badge className="bg-blue-600 hover:bg-blue-700 text-white">{status}</Badge>;
    case 'IN_REVIEW':
      return <Badge className="bg-sky-600 hover:bg-sky-700 text-white">{status}</Badge>;
    case 'ARCHIVED':
      return <Badge className="bg-amber-600 hover:bg-amber-700 text-white">{status}</Badge>;
    case 'DRAFT':
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function OriginBadge({ origin }: { origin?: string }) {
  if (!origin) return null;
  if (origin.startsWith('AI_')) {
    return (
      <Badge variant="outline" className="border-purple-400 text-purple-700 dark:text-purple-300 gap-1">
        <Sparkles className="h-3 w-3" />
        {origin}
      </Badge>
    );
  }
  return <Badge variant="outline">{origin}</Badge>;
}

export function CurriculumPanel() {
  const queryClient = useQueryClient();
  const [expandedTiers, setExpandedTiers] = React.useState<Record<number, boolean>>({ 1: true });
  const [expandedModules, setExpandedModules] = React.useState<Record<string, boolean>>({});

  // Status Change Dialog state
  const [statusDialogState, setStatusDialogState] = React.useState<{
    open: boolean;
    entity: 'modules' | 'sub-modules';
    id: string;
    title: string;
    currentStatus: ContentStatus;
    origin?: string;
  } | null>(null);

  const [targetStatus, setTargetStatus] = React.useState<ContentStatus>('IN_REVIEW');
  const [confirmReviewed, setConfirmReviewed] = React.useState(false);
  const [statusReason, setStatusReason] = React.useState('');

  // Sub-module Edit Sheet state
  const [editingSubModuleId, setEditingSubModuleId] = React.useState<string | null>(null);

  const { data: curriculum, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-curriculum'],
    queryFn: () => curationApi.curriculum(),
  });

  const statusMutation = useMutation({
    mutationFn: async () => {
      if (!statusDialogState) return;
      return await curationApi.changeStatus(statusDialogState.entity, statusDialogState.id, {
        status: targetStatus,
        reason: statusReason.trim() || undefined,
        confirm_reviewed: confirmReviewed || undefined,
      });
    },
    onSuccess: () => {
      toast.success(id.adminCuration.statusSuccess);
      queryClient.invalidateQueries({ queryKey: ['admin-curriculum'] });
      setStatusDialogState(null);
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err));
    },
  });

  const toggleTier = (tierNumber: number) => {
    setExpandedTiers((prev) => ({ ...prev, [tierNumber]: !prev[tierNumber] }));
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  const openStatusDialog = (
    entity: 'modules' | 'sub-modules',
    itemId: string,
    title: string,
    currentStatus: ContentStatus,
    origin?: string,
  ) => {
    setStatusDialogState({ open: true, entity, id: itemId, title, currentStatus, origin });
    setTargetStatus(
      currentStatus === 'DRAFT'
        ? 'IN_REVIEW'
        : currentStatus === 'IN_REVIEW'
        ? 'APPROVED'
        : currentStatus === 'APPROVED'
        ? 'PUBLISHED'
        : 'DRAFT'
    );
    setConfirmReviewed(false);
    setStatusReason('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{id.adminCuration.curriculumTitle}</h1>
          <p className="text-sm text-muted-foreground">{id.adminCuration.curriculumSubtitle}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          {id.adminCuration.refresh}
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">{id.adminCuration.loading}</div>
      ) : isError ? (
        <div className="py-12 text-center text-destructive">{id.adminCuration.loadFailed}</div>
      ) : (
        <div className="space-y-4">
          {curriculum?.map((tier: TierItem) => {
            const isTierExpanded = !!expandedTiers[tier.tier_number];
            return (
              <Card key={tier.tier_number} className="overflow-hidden">
                <CardHeader
                  className="bg-muted/40 cursor-pointer py-3 px-4 flex flex-row items-center justify-between"
                  onClick={() => toggleTier(tier.tier_number)}
                >
                  <div className="flex items-center gap-2">
                    {isTierExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <Layers className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base font-semibold">
                      Tier {tier.tier_number}: {tier.tier_name}
                    </CardTitle>
                    <Badge variant="outline" className="ml-2">
                      {tier.modules.length} {id.adminCuration.modules}
                    </Badge>
                  </div>
                </CardHeader>

                {isTierExpanded && (
                  <CardContent className="p-4 space-y-3">
                    {tier.modules.map((mod: ModuleItem) => {
                      const isModExpanded = !!expandedModules[mod.id];
                      return (
                        <div key={mod.id} className="border rounded-lg overflow-hidden bg-card">
                          <div className="p-3 bg-card flex flex-wrap items-center justify-between gap-2 border-b">
                            <div
                              className="flex items-center gap-2 cursor-pointer flex-1 min-w-[200px]"
                              onClick={() => toggleModule(mod.id)}
                            >
                              {isModExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              <Folder className="h-4 w-4 text-amber-500" />
                              <span className="font-medium text-sm">
                                {mod.order_index}. {mod.title}
                              </span>
                              <StatusBadge status={mod.status} />
                              <span className="text-xs text-muted-foreground">v{mod.content_version}</span>
                              {mod.is_blocked && (
                                <Badge variant="destructive" className="gap-1 text-xs">
                                  <AlertTriangle className="h-3 w-3" />
                                  {mod.blocker_reason || id.adminCuration.blocked}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openStatusDialog('modules', mod.id, mod.title, mod.status)}
                              >
                                {id.adminCuration.changeStatus}
                              </Button>
                            </div>
                          </div>

                          {isModExpanded && (
                            <div className="p-3 bg-muted/20 space-y-2">
                              {mod.sub_modules.map((sub: SubModuleItem) => (
                                <div
                                  key={sub.id}
                                  className="flex flex-wrap items-center justify-between gap-2 p-2 bg-background border rounded-md text-sm"
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                                    <FileText className="h-4 w-4 text-blue-500" />
                                    <span>
                                      {sub.order_index}. {sub.title}
                                    </span>
                                    <StatusBadge status={sub.status} />
                                    <OriginBadge origin={sub.origin} />
                                    <span className="text-xs text-muted-foreground">
                                      Pass: {sub.passing_score_percent}% | v{sub.content_version}
                                    </span>
                                    {sub.is_blocked && (
                                      <Badge variant="destructive" className="gap-1 text-xs">
                                        <AlertTriangle className="h-3 w-3" />
                                        {sub.blocker_reason || id.adminCuration.blocked}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditingSubModuleId(sub.id)}
                                    >
                                      <Edit2 className="h-3.5 w-3.5 mr-1" />
                                      {id.adminCuration.edit}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        openStatusDialog('sub-modules', sub.id, sub.title, sub.status, sub.origin)
                                      }
                                    >
                                      {id.adminCuration.changeStatus}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Change Status Dialog */}
      {statusDialogState && (
        <Dialog open={statusDialogState.open} onOpenChange={() => setStatusDialogState(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{id.adminCuration.changeStatusTitle}</DialogTitle>
              <DialogDescription>
                {statusDialogState.title} (Status saat ini: {statusDialogState.currentStatus})
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{id.adminCuration.targetStatus}</Label>
                <Select
                  value={targetStatus}
                  onValueChange={(val) => setTargetStatus(val as ContentStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">DRAFT</SelectItem>
                    <SelectItem value="IN_REVIEW">IN_REVIEW</SelectItem>
                    <SelectItem value="APPROVED">APPROVED</SelectItem>
                    <SelectItem value="PUBLISHED">PUBLISHED</SelectItem>
                    <SelectItem value="ARCHIVED">ARCHIVED</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* AI Confirmation requirement (K2) */}
              {(statusDialogState.origin?.startsWith('AI_') ||
                statusDialogState.origin === 'AI_GENERATED_REVIEWED') &&
                (targetStatus === 'IN_REVIEW' ||
                  targetStatus === 'APPROVED' ||
                  targetStatus === 'PUBLISHED') && (
                  <div className="flex items-start space-x-2 border p-3 rounded-md bg-purple-50/50 dark:bg-purple-950/20 border-purple-200">
                    <Checkbox
                      id="confirm-reviewed"
                      checked={confirmReviewed}
                      onCheckedChange={(c) => setConfirmReviewed(!!c)}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor="confirm-reviewed" className="cursor-pointer text-xs font-medium">
                        {id.adminCuration.confirmReviewedLabel}
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        {id.adminCuration.confirmReviewedDesc}
                      </p>
                    </div>
                  </div>
                )}

              <div className="space-y-2">
                <Label>{id.adminCuration.reasonOptional}</Label>
                <Input
                  placeholder={id.adminCuration.reasonPlaceholder}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStatusDialogState(null)}>
                {id.adminCuration.cancel}
              </Button>
              <Button
                onClick={() => statusMutation.mutate()}
                disabled={
                  statusMutation.isPending ||
                  (statusDialogState.origin?.startsWith('AI_') &&
                    (targetStatus === 'IN_REVIEW' ||
                      targetStatus === 'APPROVED' ||
                      targetStatus === 'PUBLISHED') &&
                    !confirmReviewed)
                }
              >
                {statusMutation.isPending ? id.adminCuration.saving : id.adminCuration.save}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Sub-module Sheet */}
      {editingSubModuleId && (
        <SubModuleEditSheet
          subModuleId={editingSubModuleId}
          onClose={() => setEditingSubModuleId(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-curriculum'] });
          }}
        />
      )}
    </div>
  );
}

function SubModuleEditSheet({
  subModuleId,
  onClose,
  onSuccess,
}: {
  subModuleId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-sub-module', subModuleId],
    queryFn: () => curationApi.subModule(subModuleId),
  });

  const [title, setTitle] = React.useState('');
  const [passingScore, setPassingScore] = React.useState(70);
  const [orderIndex, setOrderIndex] = React.useState(1);
  const [articleMarkdown, setArticleMarkdown] = React.useState('');
  const [attributionText, setAttributionText] = React.useState('');
  const [miniTask, setMiniTask] = React.useState('');
  const [previewTab, setPreviewTab] = React.useState<'edit' | 'preview'>('edit');

  React.useEffect(() => {
    if (data?.sub_module) {
      setTitle(data.sub_module.title || '');
      setPassingScore(data.sub_module.passing_score_percent ?? 70);
      setOrderIndex(data.sub_module.order_index ?? 1);
    }
    if (data?.material) {
      setArticleMarkdown(data.material.article_markdown || '');
      setAttributionText(data.material.attribution_text || '');
      setMiniTask(
        typeof data.material.mini_task === 'object' && data.material.mini_task?.prompt
          ? data.material.mini_task.prompt
          : typeof data.material.mini_task === 'string'
          ? data.material.mini_task
          : ''
      );
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await curationApi.updateSubModule(subModuleId, {
        title: title.trim(),
        passing_score_percent: passingScore,
        order_index: orderIndex,
      });
      if (articleMarkdown || attributionText || miniTask) {
        await curationApi.updateMaterial(subModuleId, {
          article_markdown: articleMarkdown || undefined,
          attribution_text: attributionText.trim() || null,
          mini_task: miniTask.trim()
            ? {
                task_type: 'SELF_CHECK',
                prompt: miniTask.trim(),
              }
            : null,
        });
      }
    },
    onSuccess: () => {
      toast.success(id.adminCuration.editSuccess);
      onSuccess();
      onClose();
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err));
    },
  });

  return (
    <Sheet open={true} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{id.adminCuration.editSubModuleTitle}</SheetTitle>
          <SheetDescription>{id.adminCuration.editSubModuleDesc}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">{id.adminCuration.loading}</div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{id.adminCuration.title}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{id.adminCuration.orderIndex}</Label>
                <Input
                  type="number"
                  value={orderIndex}
                  onChange={(e) => setOrderIndex(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>{id.adminCuration.passingScore}</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={passingScore}
                  onChange={(e) => setPassingScore(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <Label className="text-base font-semibold">{id.adminCuration.learningMaterial}</Label>
              <Tabs value={previewTab} onValueChange={(v) => setPreviewTab(v as 'edit' | 'preview')}>
                <TabsList className="grid grid-cols-2 w-48">
                  <TabsTrigger value="edit">{id.adminCuration.editMarkdown}</TabsTrigger>
                  <TabsTrigger value="preview">{id.adminCuration.previewMarkdown}</TabsTrigger>
                </TabsList>
                <TabsContent value="edit" className="pt-2">
                  <Textarea
                    rows={12}
                    className="font-mono text-xs"
                    value={articleMarkdown}
                    onChange={(e) => setArticleMarkdown(e.target.value)}
                    placeholder="# Materi pembelajaran..."
                  />
                </TabsContent>
                <TabsContent value="preview" className="pt-2">
                  <div className="border rounded-md p-4 bg-muted/20 min-h-[200px] prose dark:prose-invert max-w-none text-sm whitespace-pre-wrap">
                    {articleMarkdown || id.adminCuration.noContent}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-2">
              <Label>{id.adminCuration.attributionText}</Label>
              <Input
                placeholder="Sumber: ..."
                value={attributionText}
                onChange={(e) => setAttributionText(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{id.adminCuration.miniTaskOptional}</Label>
              <Textarea
                rows={3}
                placeholder="Tugas kecil untuk pembelajar..."
                value={miniTask}
                onChange={(e) => setMiniTask(e.target.value)}
              />
            </div>
          </div>
        )}

        <SheetFooter className="pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            {id.adminCuration.cancel}
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !title.trim()}>
            {saveMutation.isPending ? id.adminCuration.saving : id.adminCuration.saveChanges}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
