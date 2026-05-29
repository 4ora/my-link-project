"use client";

import React, { useEffect, useState } from "react";
import { LinkItem } from "../../Data/links";
import { db, auth } from "../../lib/firebase";
import { 
  collection, 
  getDocs, 
  query, 
  orderBy,
  doc,
  getDoc
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

interface Profile {
  uid: string;
  email: string;
  displayName: string;
  username: string;
  createdAt: string;
}

export default function StatsPage() {
  const router = useRouter();

  // 인증 세션 상태
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // 실시간 Auth 감지
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 1. 프로필 정보 쿼리 (인증 여부 확인용)
  const { data: profile, isLoading: isProfileLoading } = useQuery<Profile>({
    queryKey: ["profile", user?.uid],
    queryFn: async () => {
      if (!user?.uid) throw new Error("Not logged in");
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as Profile;
      }
      throw new Error("Profile not found");
    },
    enabled: !!user?.uid,
    retry: false,
  });

  // 2. 클릭수 내림차순 정렬 링크 목록 쿼리 (orderBy('clicks', 'desc'))
  const { data: statsLinks = [], isLoading: isLinksLoading } = useQuery<LinkItem[]>({
    queryKey: ["statsLinks", user?.uid],
    queryFn: async () => {
      if (!user?.uid) return [];
      const q = query(collection(db, `users/${user.uid}/links`), orderBy("clicks", "desc"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LinkItem[];
    },
    enabled: !!profile && !!user?.uid, // 프로필 정보가 정상 조회되었을 때 가동
  });

  // 3. 비로그인 리다이렉트 보안 가드
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.replace("/");
    }
  }, [user, isAuthLoading, router]);

  const isLoading = isAuthLoading || isProfileLoading || isLinksLoading;

  // 총 클릭수 합산
  const totalClicks = statsLinks.reduce((sum, link) => sum + (link.clicks || 0), 0);

  // 최다 클릭수 (가로 실선 백분율 계산용)
  const maxClicks = statsLinks.length > 0 ? Math.max(...statsLinks.map(l => l.clicks || 0)) : 1;
  const maxClicksDivisor = maxClicks > 0 ? maxClicks : 1;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center uppercase tracking-[0.2em] text-[10px] md:text-xs">
        LOADING STATISTICS...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center uppercase tracking-[0.1em] text-[11px] sm:text-xs md:text-sm lg:text-base transition-all duration-300 relative">
      
      {/* 최상단 MYLINK 복귀 툴바 (Primary Solid Style) */}
      <div className="hidden sm:flex absolute top-6 right-6 md:right-12 gap-3 items-center z-30 tracking-[0.2em] text-[8px] md:text-[9px]">
        <a
          href="/"
          className="bg-black text-white px-4 py-2 hover:bg-black/80 transition-colors duration-300 font-bold border border-black"
        >
          MYLINK
        </a>
      </div>

      {/* Top Header */}
      <header className="w-full text-center pt-24 pb-16 md:pt-32 md:pb-24 flex flex-col items-center px-4">
        <h1 className="font-bold tracking-[0.25em] text-lg sm:text-xl md:text-2xl lg:text-3xl mb-4 md:mb-6">
          STATISTICS
        </h1>
        <div className="w-[1px] h-8 md:h-12 lg:h-16 bg-black mx-auto mb-8 md:mb-12"></div>
        
        {/* 거대 총클릭수 캡션 */}
        <div className="flex flex-col items-center gap-2 md:gap-4 mb-4">
          <span className="text-4xl sm:text-6xl md:text-8xl font-extralight tracking-tight text-neutral-900 leading-none">
            {totalClicks.toLocaleString()}
          </span>
          <p className="opacity-55 text-[8px] md:text-[10px] tracking-[0.25em]">TOTAL CLICKS</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-sm md:max-w-xl lg:max-w-3xl flex-1 flex flex-col px-6 md:px-12 mb-24">
        
        {/* 링크별 클릭 내림차순 대시보드 리스트 */}
        <div className="flex flex-col w-full gap-8 md:gap-10 border-t border-black pt-8 md:pt-12">
          {statsLinks.length === 0 ? (
            <div className="text-center py-16 opacity-60 tracking-[0.15em] text-[10px] md:text-xs">
              NO STATS AVAILABLE.
            </div>
          ) : (
            statsLinks.map((link) => {
              const clickValue = link.clicks || 0;
              // 최다 클릭수 대비 비율 계산
              const percentage = (clickValue / maxClicksDivisor) * 100;

              return (
                <div key={link.id} className="flex flex-col w-full gap-3 group relative">
                  <div className="flex justify-between items-center w-full">
                    {/* 링크 정보 */}
                    <div className="flex items-center gap-3">
                      <img 
                        src={`https://s2.googleusercontent.com/s2/favicons?domain=${link.url}&sz=64`} 
                        alt="favicon icon" 
                        className="w-3.5 h-3.5 md:w-4 md:h-4 grayscale"
                      />
                      <span className="font-semibold tracking-[0.15em] md:text-sm normal-case">
                        {link.title}
                      </span>
                    </div>

                    {/* 조회수 아이콘 + 숫자 (텍스트 일절 배제, 0뷰 보장) */}
                    <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity text-[10px] md:text-xs ml-4">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 md:w-4 md:h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                      <span className="font-bold tracking-normal">{clickValue}</span>
                    </div>
                  </div>

                  {/* 아방가르드 미니멀 실선 비율 차트 */}
                  <div className="w-full h-[2px] bg-neutral-100 relative overflow-hidden mt-1">
                    <div 
                      className="absolute top-0 left-0 h-full bg-black transition-all duration-1000 ease-out"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })
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
