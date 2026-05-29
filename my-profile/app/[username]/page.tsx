"use client";

import React from "react";
import { LinkItem } from "../../Data/links";
import { db } from "../../lib/firebase";
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  where,
  updateDoc,
  doc,
  increment
} from "firebase/firestore";
import { useQuery, useMutation } from "@tanstack/react-query";
import { notFound } from "next/navigation";

interface UserProfilePageProps {
  params: Promise<{ username: string }>;
}

export default function UserProfilePage({ params }: UserProfilePageProps) {
  // Next.js 15+ 및 React 19의 비동기 params 풀기
  const { username } = React.use(params);

  // 1. displayName 기반 유저 조회 Query
  const { data: userProfile, isLoading: isUserLoading, isError: isUserError } = useQuery({
    queryKey: ["userProfile", username],
    queryFn: async () => {
      const decodedUsername = decodeURIComponent(username);
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("displayName", "==", decodedUsername));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        throw new Error("User not found");
      }

      const userDoc = snapshot.docs[0];
      return {
        uid: userDoc.id,
        ...userDoc.data()
      } as {
        uid: string;
        username: string;
        displayName: string;
        avatarUrl?: string;
        bio?: string;
        email: string;
        createdAt: string;
      };
    },
    retry: false, // 404 판별을 신속히 하기 위해 재시도 안 함
  });

  // 2. 유저의 uid 기반 링크 리스트 조회 Query (유저 프로필 쿼리가 성공했을 때만 작동)
  const { data: links = [], isLoading: isLinksLoading } = useQuery<LinkItem[]>({
    queryKey: ["userLinks", userProfile?.uid],
    queryFn: async () => {
      if (!userProfile?.uid) return [];
      const q = query(collection(db, `users/${userProfile.uid}/links`), orderBy("createdAt", "asc"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LinkItem[];
    },
    enabled: !!userProfile?.uid,
  });

  // 사용자가 존재하지 않으면 Next.js 표준 404 페이지 트리거
  if (isUserError) {
    notFound();
  }

  // 3. 방문자용 클릭 트래킹 Mutation (상대방 uid 기반의 경로로 clicks increment 처리)
  const trackClickMutation = useMutation({
    mutationFn: async (linkId: string) => {
      if (!userProfile?.uid) return;
      const linkDocRef = doc(db, `users/${userProfile.uid}/links`, linkId);
      await updateDoc(linkDocRef, {
        clicks: increment(1),
      });
    },
    onError: (error) => {
      console.error("Error tracking click:", error);
    }
  });

  const handleLinkClick = (linkId: string) => {
    trackClickMutation.mutate(linkId);
  };

  const isLoading = isUserLoading || isLinksLoading;

  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center uppercase tracking-[0.1em] text-[11px] sm:text-xs md:text-sm lg:text-base transition-all duration-300 relative">
      {/* Top Header */}
      <header className="w-full text-center pt-24 pb-16 md:pt-32 md:pb-24 flex flex-col items-center px-4">
        {/* 미니멀 아바타 아이콘 */}
        <div className="w-16 h-16 md:w-20 md:h-20 border border-black rounded-full flex items-center justify-center mb-6 opacity-80 bg-neutral-50/50 overflow-hidden">
          {isLoading ? (
            <div className="w-4 h-4 md:w-5 md:h-5 border-t border-black rounded-full animate-spin"></div>
          ) : userProfile?.avatarUrl ? (
            <img 
              src={userProfile.avatarUrl} 
              alt="Profile Avatar" 
              className="w-full h-full object-cover"
            />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={0.8} stroke="currentColor" className="w-8 h-8 md:w-10 md:h-10">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          )}
        </div>

        <h1 className="font-bold tracking-[0.2em] text-lg sm:text-xl md:text-2xl lg:text-3xl mb-4 md:mb-6">
          {isLoading ? "LOADING..." : (userProfile?.username || "BORA JO")}
        </h1>
        <div className="w-[1px] h-8 md:h-12 lg:h-16 bg-black mx-auto mb-4 md:mb-6"></div>
        <p className="opacity-60 text-[10px] md:text-xs lg:text-sm tracking-[0.15em] normal-case">
          my-link.com/{isLoading ? "loading" : (userProfile?.displayName || "bora_jo")}
        </p>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-sm md:max-w-xl lg:max-w-3xl flex-1 flex flex-col px-6 md:px-12">
        
        {/* Intro / Bio */}
        {userProfile?.bio && (
          <div className="text-center mb-16 md:mb-24 opacity-80 leading-[1.8] tracking-wider text-[11px] md:text-xs lg:text-sm font-light normal-case whitespace-pre-wrap">
            {userProfile.bio}
          </div>
        )}

        {/* Links List */}
        <div className="flex flex-col w-full gap-4 md:gap-6 border-t border-black pt-4 md:pt-8 lg:pt-12 mb-12">
          {isLoading ? (
            <div className="text-center py-12 md:py-16 opacity-60 tracking-[0.15em] text-[10px] md:text-xs">
              LOADING LINKS...
            </div>
          ) : links.length === 0 ? (
            <div className="text-center py-12 md:py-16 opacity-60 tracking-[0.15em] text-[10px] md:text-xs">
              NO LINKS FOUND.
            </div>
          ) : (
            links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleLinkClick(link.id)}
                className="group relative flex justify-center items-center w-full py-4 md:py-6 lg:py-8 border-b border-black hover:px-4 md:hover:px-8 transition-all duration-300 ease-in-out"
              >
                <div className="flex items-center gap-4">
                  <img 
                    src={`https://s2.googleusercontent.com/s2/favicons?domain=${link.url}&sz=64`} 
                    alt={`${link.title} icon`} 
                    className="w-4 h-4 md:w-5 md:h-5 grayscale group-hover:grayscale-0 transition-all duration-300 opacity-80 group-hover:opacity-100"
                  />
                  <span className="font-semibold tracking-[0.15em] md:text-sm lg:text-base">{link.title}</span>
                </div>
                <span className="absolute right-4 md:right-8 opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-[10px] md:text-xs">
                  ↗
                </span>
              </a>
            ))
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-16 md:py-24 text-[9px] md:text-[10px] lg:text-xs opacity-40 tracking-[0.2em] flex flex-col gap-3 md:gap-4 mt-auto">
        <p>SEOUL, SOUTH KOREA</p>
        <p>© {new Date().getFullYear()} BORA JO. ALL RIGHTS RESERVED.</p>
      </footer>
    </div>
  );
}
