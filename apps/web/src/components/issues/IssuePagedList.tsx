import type { EnvironmentId, IssueTrackerSource } from "@t3tools/contracts";
import type { AsyncResult, Atom } from "effect/reactivity";
import { type ReactNode, useState } from "react";

import { type EnvironmentQueryView, useEnvironmentQuery } from "~/state/query";

import {
  IssueErrorAlert,
  IssueListSkeleton,
  IssueTrackerStateView,
  LoadMoreButton,
} from "./IssuePanelChrome";

/** A tracker's list query family, e.g. `linearEnvironment.issues`. */
export type IssuePageQuery<Input, Page, E> = (target: {
  readonly environmentId: EnvironmentId;
  readonly input: Input;
}) => Atom.Atom<AsyncResult.AsyncResult<Page, E>>;

interface CursorInput {
  readonly cursor?: string;
}

interface CursorPage {
  readonly nextCursor: string | null;
}

export interface IssuePages<Input extends CursorInput, Page extends CursorPage, E> {
  readonly environmentId: EnvironmentId;
  readonly query: IssuePageQuery<Input, Page, E>;
  readonly input: Input;
  readonly firstPage: EnvironmentQueryView<Page, E>;
  readonly cursors: ReadonlyArray<string>;
  readonly loadMore: (cursor: string) => void;
  /** Refetches the first page and drops the later ones. */
  readonly refresh: () => void;
  readonly refreshing: boolean;
  /** A failed refresh while the last good first page is still shown, for the shell's inline error. */
  readonly staleError: string | null;
}

const NO_CURSORS: ReadonlyArray<string> = [];

/** The first page of a tracker list plus the pages "Load more" adds. A new input starts over. */
export function useIssuePages<Input extends CursorInput, Page extends CursorPage, E>(
  query: IssuePageQuery<Input, Page, E>,
  environmentId: EnvironmentId,
  input: Input,
): IssuePages<Input, Page, E> {
  const firstAtom = query({ environmentId, input });
  const firstPage = useEnvironmentQuery(firstAtom);
  // Later pages belong to the first page's query; the family returns one atom per input.
  const [more, setMore] = useState<{
    readonly list: Atom.Atom<unknown> | null;
    readonly cursors: ReadonlyArray<string>;
  }>({ list: null, cursors: NO_CURSORS });
  const cursors = more.list === firstAtom ? more.cursors : NO_CURSORS;
  return {
    environmentId,
    query,
    input,
    firstPage,
    cursors,
    loadMore: (cursor) => setMore({ list: firstAtom, cursors: [...cursors, cursor] }),
    refresh: () => {
      setMore({ list: firstAtom, cursors: NO_CURSORS });
      firstPage.refresh();
    },
    refreshing: firstPage.isPending,
    staleError: firstPage.data === null ? null : firstPage.error,
  };
}

/** The body of a tracker list: loading, failure and empty states, rows, and "Load more". */
export function IssuePageList<Input extends CursorInput, Page extends CursorPage, E>(props: {
  readonly source: IssueTrackerSource;
  readonly pages: IssuePages<Input, Page, E>;
  readonly isEmpty: (page: Page) => boolean;
  readonly emptyMessage: string;
  readonly renderPage: (page: Page) => ReactNode;
}) {
  const { firstPage, cursors } = props.pages;
  if (firstPage.data === null) {
    return firstPage.error !== null ? (
      <IssueTrackerStateView
        source={props.source}
        failure={firstPage.failure}
        error={firstPage.error}
        onRetry={props.pages.refresh}
      />
    ) : (
      <IssueListSkeleton />
    );
  }
  if (props.isEmpty(firstPage.data)) {
    return (
      <IssueTrackerStateView
        source={props.source}
        failure={null}
        error={null}
        emptyMessage={props.emptyMessage}
      />
    );
  }
  const nextCursor = firstPage.data.nextCursor;
  return (
    <>
      {props.renderPage(firstPage.data)}
      {cursors.map((cursor, index) => (
        <LaterIssuePage
          key={cursor}
          pages={props.pages}
          cursor={cursor}
          isLast={index === cursors.length - 1}
          renderPage={props.renderPage}
        />
      ))}
      {cursors.length === 0 && nextCursor !== null ? (
        <LoadMoreButton loading={false} onClick={() => props.pages.loadMore(nextCursor)} />
      ) : null}
    </>
  );
}

function LaterIssuePage<Input extends CursorInput, Page extends CursorPage, E>(props: {
  readonly pages: IssuePages<Input, Page, E>;
  readonly cursor: string;
  readonly isLast: boolean;
  readonly renderPage: (page: Page) => ReactNode;
}) {
  const { pages } = props;
  const page = useEnvironmentQuery(
    pages.query({
      environmentId: pages.environmentId,
      input: { ...pages.input, cursor: props.cursor },
    }),
  );
  if (page.data === null) {
    return page.error === null ? (
      <LoadMoreButton loading onClick={page.refresh} />
    ) : (
      <div className="my-1">
        <IssueErrorAlert error={page.error} onRetry={page.refresh} />
      </div>
    );
  }
  const nextCursor = page.data.nextCursor;
  return (
    <>
      {props.renderPage(page.data)}
      {props.isLast && nextCursor !== null ? (
        <LoadMoreButton loading={false} onClick={() => pages.loadMore(nextCursor)} />
      ) : null}
    </>
  );
}
