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
import { useThemeSync } from "@/hooks/useTheme";
import { useDownloads } from "@/store/downloads";

export default function App() {
  useThemeSync();
  const initDownloads = useDownloads((s) => s.init);

  useEffect(() => {
    void initDownloads();
  }, [initDownloads]);

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
          <Route path="sources" element={<SourcesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <PlayerHost />
    </HashRouter>
  );
}
