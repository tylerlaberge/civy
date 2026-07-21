/**
 * A comment on a bill. Threading is modeled by `parentId`: a top-level comment
 * has `parentId: null`, a reply points at the comment it answers. Deletion is
 * soft (`deletedAt`) so a deleted comment can remain in the tree as a tombstone
 * without orphaning its replies.
 */
export interface Comment {
  id: string;
  billId: string;
  authorId: string;
  body: string;
  /**
   * The comment this replies to, or `null` for a top-level comment. Stays
   * `| null` (not optional): every comment has a definite threading state, and
   * `null` is a meaningful value ("top-level"), not an absent one — unlike
   * `deletedAt`, whose absence just means "not deleted".
   */
  parentId: string | null;
  createdAt: string;
  /** When the comment was soft-deleted; omitted while the comment is live. */
  deletedAt?: string;
}
