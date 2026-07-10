import StoryPage from '@/components/StoryPage';

export const metadata = {
  title: 'Story Intelligence — The Meridian Brief',
};

export default function Page({ params, searchParams }) {
  return <StoryPage id={params.id} editionHint={searchParams?.edition} />;
}
