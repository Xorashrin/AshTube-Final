import { useNavigation, type NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type TabParamList = {
  Home: { genre?: string; filter?: 'all' | 'tv' | 'movies' } | undefined;
  Anime: undefined;
  KDrama: undefined;
  Profiles: undefined;
  MyNetflix: undefined;
  TV: undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  Landing: undefined;
  SignIn: undefined;
  SignUp: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  Title: { id: string; season?: number };
  Player: { id: string; episodeId?: string };
  Live: { channelId: string; filter?: string };
  LiveTv: undefined;
  KDrama: undefined;
  /** Scope comes from where search was opened: a genre/category, movies or series only, anime, kdrama, or live TV. */
  Search: { genre?: string; kind?: 'movie' | 'series' | 'anime' | 'kdrama'; live?: boolean } | undefined;
  Categories: { current?: string } | undefined;
  MyList: undefined;
  Downloads: undefined;
  Notifications: undefined;
  AppSettings: undefined;
  Profiles: { mode?: 'manage' } | undefined;
  // Dedicated Adult Content screen (requirement 9)
  AdultContent: undefined;
};

export type RootNav = NativeStackNavigationProp<RootStackParamList>;

export function useRootNav(): RootNav {
  return useNavigation<RootNav>();
}
