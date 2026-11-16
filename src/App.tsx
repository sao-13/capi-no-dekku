import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { FocusLayout } from './components/FocusLayout';
import { Today } from './pages/Today';
import { Decks } from './pages/Decks';
import { DeckDetail } from './pages/DeckDetail';
import { Study } from './pages/Study';
import { Quiz } from './pages/Quiz';
import { Progress } from './pages/Progress';
import { Studio } from './pages/Studio';
import { Friends } from './pages/Friends';
import { Customize } from './pages/Customize';
import { NotFound } from './pages/NotFound';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Today />} />
          <Route path="decks" element={<Decks />} />
          <Route path="decks/:deckId" element={<DeckDetail />} />
          <Route path="progress" element={<Progress />} />
          <Route path="studio" element={<Studio />} />
          <Route path="import" element={<Navigate to="/studio" replace />} />
          <Route path="friends" element={<Friends />} />
          <Route path="customize" element={<Customize />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route element={<FocusLayout />}>
          <Route path="decks/:deckId/study" element={<Study />} />
          <Route path="study" element={<Study />} />
          <Route path="decks/:deckId/quiz" element={<Quiz />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
