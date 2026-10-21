import { useNavigation, type NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type TabParamList = {
  Home: { genre?: string } | undefined;
  TV: undefined;
  Anime: undefined;
  MyNetflix: undefined;
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
  /** Scope comes from where search was opened: a genre/category, movies or series only, or live TV. */
  Search: { genre?: string; kind?: 'movie' | 'series' | 'anime'; live?: boolean } | undefined;
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
