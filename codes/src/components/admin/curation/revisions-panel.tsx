'use client';

import { useQuery } from '@tanstack/react-query';
import { Copy, Eye, History, RefreshCw, Search } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { RevisionEntityType } from '@/contracts/curation';
import { id } from '@/i18n/id';
import { curationApi } from '@/lib/api/curation';

type RevisionListItem = {
  id: string;
  entity_type: string;
  entity_id: string;
  revision_number: number;
  change_summary: string;
  created_by: string;
  created_at: string;
};

export function RevisionsPanel({
  initialEntityType = 'sub_modules',
  initialEntityId = '',
}: {
  initialEntityType?: RevisionEntityType;
  initialEntityId?: string;
}) {
  const [entityType, setEntityType] = React.useState<RevisionEntityType>(initialEntityType);
  const [entityId, setEntityId] = React.useState<string>(initialEntityId);
  const [appliedEntityId, setAppliedEntityId] = React.useState<string>(initialEntityId);
  const [selectedRevisionId, setSelectedRevisionId] = React.useState<string | null>(null);

  const { data: revisionsResponse, isLoading, refetch } = useQuery({
    queryKey: ['admin-content-revisions', entityType, appliedEntityId],
    queryFn: () =>
      appliedEntityId
        ? curationApi.revisions({
            entity_type: entityType,
            entity_id: appliedEntityId,
            page: 1,
            page_size: 20,
          })
        : null,
    enabled: !!appliedEntityId,
  });

  const { data: revisionDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['admin-content-revision-detail', selectedRevisionId],
    queryFn: () => (selectedRevisionId ? curationApi.revision(selectedRevisionId) : null),
    enabled: !!selectedRevisionId,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedEntityId(entityId.trim());
  };

  const copySnapshot = async (jsonText: string) => {
    try {
      await navigator.clipboard.writeText(jsonText);
      toast.success(id.adminCuration.copySuccess);
    } catch {
      toast.error('Gagal menyalin ke papan klip');
    }
  };

  const revisions = revisionsResponse?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{id.adminCuration.revisionsTitle}</h1>
          <p className="text-sm text-muted-foreground">{id.adminCuration.revisionsSubtitle}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading || !appliedEntityId}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          {id.adminCuration.refresh}
        </Button>
      </div>

      {/* Filter toolbar */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <Label className="text-xs">{id.adminCuration.entityType}</Label>
              <Select
                value={entityType}
                onValueChange={(val) => setEntityType(val as RevisionEntityType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="modules">Module (modules)</SelectItem>
                  <SelectItem value="sub_modules">Sub-Module (sub_modules)</SelectItem>
                  <SelectItem value="learning_materials">Materi (learning_materials)</SelectItem>
                  <SelectItem value="assessment_sets">Set Soal (assessment_sets)</SelectItem>
                  <SelectItem value="questions">Soal (questions)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">{id.adminCuration.entityId}</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ID entitas (cth: mod_..., sub_...)"
                  className="pl-8"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Button type="submit" className="w-full" disabled={!entityId.trim()}>
                {id.adminCuration.viewHistory}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Revisions Table */}
      <Card>
        <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            {id.adminCuration.revisionList} {appliedEntityId ? `(${revisions.length})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!appliedEntityId ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {id.adminCuration.inputEntityIdHint}
            </div>
          ) : isLoading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">{id.adminCuration.loading}</div>
          ) : revisions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {id.adminCuration.noRevisionsFound}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rev #</TableHead>
                  <TableHead>{id.adminCuration.changeSummary}</TableHead>
                  <TableHead className="w-36">{id.adminCuration.editor}</TableHead>
                  <TableHead className="w-48">{id.adminCuration.date}</TableHead>
                  <TableHead className="w-24 text-right">{id.adminCuration.snapshot}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revisions.map((rev: RevisionListItem) => (
                  <TableRow key={rev.id}>
                    <TableCell className="font-mono text-xs">
                      <Badge variant="outline">r{rev.revision_number}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-medium">{rev.change_summary}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {rev.created_by?.slice(0, 10)}...
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(rev.created_at).toLocaleString('id-ID')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedRevisionId(rev.id)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        {id.adminCuration.view}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Snapshot Detail Sheet */}
      {selectedRevisionId && (
        <Sheet open={true} onOpenChange={() => setSelectedRevisionId(null)}>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>
                {id.adminCuration.snapshotTitle} (r{revisionDetail?.revision_number})
              </SheetTitle>
              <SheetDescription>
                {revisionDetail?.entity_type} • ID: {revisionDetail?.entity_id}
              </SheetDescription>
            </SheetHeader>

            {isLoadingDetail ? (
              <div className="py-12 text-center text-muted-foreground">{id.adminCuration.loading}</div>
            ) : revisionDetail ? (
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">Ringkasan: </span>
                    {revisionDetail.change_summary}
                  </div>
                  <div>
                    {new Date(revisionDetail.created_at).toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="relative">
                  <div className="flex items-center justify-between pb-1">
                    <Label className="text-xs font-mono">JSON Snapshot</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => copySnapshot(formatJson(revisionDetail.snapshot_payload))}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      {id.adminCuration.copyJson}
                    </Button>
                  </div>
                  <pre className="p-3 bg-muted rounded-md text-xs font-mono overflow-x-auto max-h-[500px]">
                    {formatJson(revisionDetail.snapshot_payload)}
                  </pre>
                </div>
              </div>
            ) : null}

            <SheetFooter className="pt-4 border-t">
              <Button variant="outline" onClick={() => setSelectedRevisionId(null)}>
                {id.adminCuration.close}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function formatJson(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'object') {
    return JSON.stringify(raw, null, 2);
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  }
  return String(raw);
}
