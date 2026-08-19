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
  if (length > 1 && previousOrder.length === length
      && nextOrder.every((question, index) => question === previousOrder[index])) {
    [nextOrder[0], nextOrder[1]] = [nextOrder[1], nextOrder[0]];
  }
  return nextOrder;
}
