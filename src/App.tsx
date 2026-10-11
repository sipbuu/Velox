import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { PlayerHost } from "@/components/layout/PlayerHost";
import { HomePage } from "@/pages/HomePage";
import { BrowsePage } from "@/pages/BrowsePage";
import { SeriesDetailPage } from "@/pages/SeriesDetailPage";
import { SearchPage } from "@/pages/SearchPage";
import { SourcesPage } from "@/pages/SourcesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { DownloadsPage } from "@/pages/DownloadsPage";
import { FavoritesPage } from "@/pages/FavoritesPage";
import { MorePage } from "@/pages/MorePage";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { PinPrompt } from "@/components/ui/PinPrompt";
import { useThemeSync } from "@/hooks/useTheme";
import { useNativeChrome } from "@/hooks/useNativeChrome";
import { useDownloads } from "@/store/downloads";
import { useSettings } from "@/store/settings";
import { invoke } from "@/lib/ipc";
import { isTauri } from "@/lib/platform";

export default function App() {
  useThemeSync();
  useNativeChrome();
  const initDownloads = useDownloads((s) => s.init);
  const concurrency = useSettings((s) => s.downloadConcurrency);

  useEffect(() => {
    void initDownloads();
  }, [initDownloads]);

  useEffect(() => {
    if (isTauri()) void invoke("downloads_set_concurrency", { n: concurrency }).catch(() => {});
  }, [concurrency]);

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="live" element={<BrowsePage key="live" kind="live" />} />
          <Route path="movies" element={<BrowsePage key="movie" kind="movie" />} />
          <Route path="series" element={<BrowsePage key="series" kind="series" />} />
          <Route path="series/:uid" element={<SeriesDetailPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="downloads" element={<DownloadsPage />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route path="more" element={<MorePage />} />
          <Route path="sources" element={<SourcesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <PlayerHost />
      <ActionSheet />
      <PinPrompt />
    </HashRouter>
  );
}
