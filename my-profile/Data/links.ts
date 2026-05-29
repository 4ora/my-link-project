export interface LinkItem {
  id: string;
  title: string;
  url: string;
  clicks?: number;
  createdAt?: string;
  updatedAt?: string;
}

export const dummyLinks: LinkItem[] = [
  {
    id: "1",
    title: "Portfolio",
    url: "https://portfolio.com",
    createdAt: new Date().toISOString(),
  },
  {
    id: "2",
    title: "GitHub",
    url: "https://github.com/borajo",
    createdAt: new Date().toISOString(),
  },
  {
    id: "3",
    title: "Instagram",
    url: "https://instagram.com/borajo",
    createdAt: new Date().toISOString(),
  }
];
