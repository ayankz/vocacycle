import type { HomeListeningStatistics } from '../components/HomeListeningStats';
import { mockTotalWordCount } from './recent-words.mock';

export const mockListeningStatistics: HomeListeningStatistics = {
  wordsSaved: mockTotalWordCount,
  sessions: 8,
  listenedMinutes: 272,
};
