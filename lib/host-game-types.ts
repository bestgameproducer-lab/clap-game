export type HostQuickQuizQuestion = {
  prompt: string;
  answer: string;
  backup: boolean;
};

export type HostQuickQuizCategory = {
  id: string;
  title: string;
  questions: HostQuickQuizQuestion[];
};

export type HostCharadesCategory = {
  id: string;
  title: string;
  words: string[];
};

export type HostCoupleQuizQuestion = {
  id: number;
  prompt: string;
  answer: '新郎' | '新娘' | null;
};

export type HostGameToolkitData = {
  quickQuiz: HostQuickQuizCategory[];
  charades: HostCharadesCategory[];
  coupleQuiz: HostCoupleQuizQuestion[];
};
