export type RandomIndex = (upperBound: number) => number;

export function shuffledQuickQuestionOrder(
  length: number,
  previousOrder: number[] = [],
  randomIndex: RandomIndex = (upperBound) => Math.floor(Math.random() * upperBound),
) {
  const nextOrder = Array.from({ length }, (_, index) => index);
  for (let index = nextOrder.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [nextOrder[index], nextOrder[swapIndex]] = [nextOrder[swapIndex], nextOrder[index]];
  }
  if (length > 1 && previousOrder.length === length && nextOrder[0] === previousOrder[0]) {
    const replacementIndex = nextOrder.findIndex((question) => question !== previousOrder[0]);
    [nextOrder[0], nextOrder[replacementIndex]] = [nextOrder[replacementIndex], nextOrder[0]];
  }
  return nextOrder;
}
