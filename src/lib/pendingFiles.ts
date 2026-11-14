/** Files the learner agreed to open, handed from a drop zone to the card studio across navigation. */
let pending: File[] = [];

export const setPendingFiles = (files: File[]) => {
  pending = files;
};

export function takePendingFiles(): File[] {
  const files = pending;
  pending = [];
  return files;
}
