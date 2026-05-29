"use client";

import { useState, useEffect } from "react";
import { LinkItem } from "../Data/links";
import Link from "next/link";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { db, auth, googleProvider, storage } from "../lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc, 
  setDoc, 
  where,
  increment
} from "firebase/firestore";
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User 
} from "firebase/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const linkSchema = z.object({
  title: z.string().min(1, "Title is required"),
  url: z.string().url("Invalid URL format").min(1, "URL is required"),
});

const profileSchema = z.object({
  username: z.string().min(1, "Username is required"),
  displayName: z.string()
    .min(1, "Display name is required")
    .regex(/^[a-zA-Z0-9_-]+$/, "영문, 숫자, 하이픈(-), 언더바(_)만 가능합니다."),
  avatarUrl: z.string().optional(),
  bio: z.string().max(150, "소개글은 150자 이내로 입력해주세요.").optional(),
});

type LinkFormValues = z.infer<typeof linkSchema>;
type ProfileFormValues = z.infer<typeof profileSchema>;

interface Profile {
  uid: string;
  email: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
  createdAt: string;
}

export default function Home() {
  const queryClient = useQueryClient();
  
  // 인증 세션 상태
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // UI 상태
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [deletingLink, setDeletingLink] = useState<LinkItem | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // 중복 확인 관련 상태
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [duplicateSuccess, setDuplicateSuccess] = useState<string | null>(null);

  // Forms
  const addForm = useForm<LinkFormValues>({
    resolver: zodResolver(linkSchema),
    defaultValues: {
      title: "",
      url: "",
    },
  });

  const editForm = useForm<LinkFormValues>({
    resolver: zodResolver(linkSchema),
    defaultValues: {
      title: "",
      url: "",
    },
  });

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: "",
      displayName: "",
      avatarUrl: "",
      bio: "",
    },
  });

  // 0. 실시간 Auth 상태 관측
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 1. 프로필 Query
  const { data: profile, isLoading: isProfileLoading } = useQuery<Profile>({
    queryKey: ["profile", user?.uid],
    queryFn: async () => {
      if (!user?.uid) throw new Error("Not logged in");
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as Profile;
      } else {
        // 혹시 가입 로직이 유실된 경우를 위한 안전장치 기본 데이터 생성
        const emailId = user.email ? user.email.split("@")[0] : "user";
        const sanitizedDisplayName = emailId.replace(/[^a-zA-Z0-9_-]/g, "_");
        const defaultProfile: Profile = {
          uid: user.uid,
          email: user.email || "",
          displayName: sanitizedDisplayName,
          username: user.displayName || "BORA JO",
          avatarUrl: user.photoURL || "",
          createdAt: new Date().toISOString(),
        };
        await setDoc(docRef, defaultProfile);
        return defaultProfile;
      }
    },
    enabled: !!user?.uid,
  });

  // 2. 링크 Query
  const { data: links = [], isLoading: isLinksLoading, isFetching: isLinksFetching } = useQuery<LinkItem[]>({
    queryKey: ["links", user?.uid],
    queryFn: async () => {
      if (!user?.uid) return [];
      const q = query(collection(db, `users/${user.uid}/links`), orderBy("createdAt", "asc"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LinkItem[];
    },
    enabled: !!user?.uid,
  });

  // 3. 링크 추가 Mutation
  const addLinkMutation = useMutation({
    mutationFn: async (data: LinkFormValues) => {
      if (!user?.uid) return;
      await addDoc(collection(db, `users/${user.uid}/links`), {
        title: data.title.trim(),
        url: data.url.trim(),
        clicks: 0,
        createdAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      setIsDialogOpen(false);
      addForm.reset();
      queryClient.invalidateQueries({ queryKey: ["links", user?.uid] });
      toast.success("새로운 링크가 추가되었습니다.");
    },
    onError: (error) => {
      console.error("Error adding link:", error);
      toast.error("링크 추가에 실패했습니다.");
    }
  });

  // 4. 링크 수정 Mutation
  const editLinkMutation = useMutation({
    mutationFn: async (data: LinkFormValues & { id: string }) => {
      if (!user?.uid) return;
      const linkDocRef = doc(db, `users/${user.uid}/links`, data.id);
      await updateDoc(linkDocRef, {
        title: data.title.trim(),
        url: data.url.trim(),
        updatedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      setEditingLinkId(null);
      editForm.reset();
      queryClient.invalidateQueries({ queryKey: ["links", user?.uid] });
      toast.success("링크가 성공적으로 수정되었습니다.");
    },
    onError: (error) => {
      console.error("Error updating link:", error);
      toast.error("링크 수정에 실패했습니다.");
    }
  });

  // 5. 링크 삭제 Mutation
  const deleteLinkMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.uid) return;
      await deleteDoc(doc(db, `users/${user.uid}/links`, id));
    },
    onSuccess: () => {
      if (editingLinkId === deletingLink?.id) {
        setEditingLinkId(null);
      }
      setDeletingLink(null);
      queryClient.invalidateQueries({ queryKey: ["links", user?.uid] });
      toast.success("링크가 완전히 삭제되었습니다.");
    },
    onError: (error) => {
      console.error("Error deleting link:", error);
      toast.error("링크 삭제에 실패했습니다.");
    }
  });

  // 6. 프로필 수정 Mutation (Optimistic Update)
  const updateProfileMutation = useMutation({
    mutationFn: async (newProfile: ProfileFormValues) => {
      if (!user?.uid) return;
      const profileDocRef = doc(db, "users", user.uid);
      await updateDoc(profileDocRef, {
        username: newProfile.username.trim(),
        displayName: newProfile.displayName.trim(),
        avatarUrl: newProfile.avatarUrl ? newProfile.avatarUrl.trim() : "",
        bio: newProfile.bio ? newProfile.bio.trim() : "",
        updatedAt: new Date().toISOString(),
      });
    },
    onMutate: async (newProfile) => {
      await queryClient.cancelQueries({ queryKey: ["profile", user?.uid] });
      const previousProfile = queryClient.getQueryData<Profile>(["profile", user?.uid]);
      
      queryClient.setQueryData<Profile>(["profile", user?.uid], (old) => {
        if (!old) return old;
        return {
          ...old,
          username: newProfile.username,
          displayName: newProfile.displayName,
          avatarUrl: newProfile.avatarUrl,
          bio: newProfile.bio,
        };
      });

      return { previousProfile };
    },
    onError: (err, newProfile, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData(["profile", user?.uid], context.previousProfile);
      }
      console.error("Error updating profile:", err);
      toast.error("프로필 업데이트에 실패했습니다.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", user?.uid] });
    },
    onSuccess: () => {
      setIsProfileDialogOpen(false);
      toast.success("프로필 정보가 안전하게 수정되었습니다.");
    }
  });

  // 7. 링크 클릭수 트래킹 Mutation
  const trackClickMutation = useMutation({
    mutationFn: async (linkId: string) => {
      if (!user?.uid) return;
      const linkDocRef = doc(db, `users/${user.uid}/links`, linkId);
      await updateDoc(linkDocRef, {
        clicks: increment(1),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links", user?.uid] });
    },
    onError: (error) => {
      console.error("Error tracking click:", error);
    }
  });

  // Global click listener to close active dropdown menu
  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveMenuId(null);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
    };
  }, []);

  // 구글 소셜 로그인 연동
  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const loggedUser = result.user;
      
      // 신규 회원가입 처리 유무 검사
      const userRef = doc(db, "users", loggedUser.uid);
      const docSnap = await getDoc(userRef);
      
      if (!docSnap.exists()) {
        const emailId = loggedUser.email ? loggedUser.email.split("@")[0] : "user";
        // 영문, 숫자, 하이픈, 언더바 형태가 아니면 정제
        const sanitizedDisplayName = emailId.replace(/[^a-zA-Z0-9_-]/g, "_");
        
        const defaultProfile = {
          uid: loggedUser.uid,
          email: loggedUser.email || "",
          displayName: sanitizedDisplayName,
          username: loggedUser.displayName || "BORA JO",
          createdAt: new Date().toISOString(),
        };
        await setDoc(userRef, defaultProfile);
      }
      toast.success(`${loggedUser.displayName || "회원"}님, MYLINK에 환영합니다!`);
    } catch (error: any) {
      console.error("Login error:", error);
      toast.error("구글 소셜 로그인에 실패했습니다.");
    }
  };

  // 로그아웃 연동
  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.info("안전하게 로그아웃되었습니다.");
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("로그아웃 도중 에러가 발생했습니다.");
    }
  };

  const onAddSubmit = (data: LinkFormValues) => {
    addLinkMutation.mutate(data);
  };

  const onEditSubmit = (data: LinkFormValues) => {
    if (!editingLinkId) return;
    editLinkMutation.mutate({ ...data, id: editingLinkId });
  };

  const onProfileSubmit = (data: ProfileFormValues) => {
    updateProfileMutation.mutate(data);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    addForm.reset();
  };

  const handleOpenInlineEdit = (link: LinkItem) => {
    setEditingLinkId(link.id);
    editForm.reset({
      title: link.title,
      url: link.url,
    });
  };

  const confirmDeleteLink = () => {
    if (!deletingLink) return;
    deleteLinkMutation.mutate(deletingLink.id);
  };

  const handleLinkClick = (linkId: string) => {
    trackClickMutation.mutate(linkId);
  };

  // displayName 중복 확인
  const checkDisplayName = async (displayNameToCheck: string) => {
    if (!displayNameToCheck.trim()) {
      setDuplicateError("디스플레이 네임을 입력해주세요.");
      return;
    }
    
    // 정규식 검증
    if (!/^[a-zA-Z0-9_-]+$/.test(displayNameToCheck)) {
      setDuplicateError("영문, 숫자, 하이픈(-), 언더바(_)만 사용 가능합니다.");
      return;
    }

    // 현재 디스플레이 네임과 같으면 통과
    if (displayNameToCheck.trim() === profile?.displayName) {
      setDuplicateSuccess("현재 사용 중인 디스플레이 네임입니다.");
      setDuplicateError(null);
      return;
    }

    setIsCheckingDuplicate(true);
    setDuplicateError(null);
    setDuplicateSuccess(null);

    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("displayName", "==", displayNameToCheck.trim()));
      const snapshot = await getDocs(q);
      const isDup = snapshot.docs.some(doc => doc.id !== user?.uid);

      if (isDup) {
        setDuplicateError("이미 사용 중인 디스플레이 네임입니다.");
        toast.error("중복된 디스플레이 네임입니다.");
      } else {
        setDuplicateSuccess("사용 가능한 디스플레이 네임입니다.");
        toast.success("사용 가능한 디스플레이 네임입니다!");
      }
    } catch (error) {
      console.error("Duplicate check error:", error);
      setDuplicateError("중복 확인 중 에러가 발생했습니다.");
    } finally {
      setIsCheckingDuplicate(false);
    }
  };

  // displayName 입력값 변경 감지하여 중복 검사 상태 초기화
  const watchedDisplayName = profileForm.watch("displayName");
  useEffect(() => {
    if (watchedDisplayName !== profile?.displayName) {
      setDuplicateSuccess(null);
      setDuplicateError(null);
    } else {
      setDuplicateSuccess("현재 사용 중인 디스플레이 네임입니다.");
      setDuplicateError(null);
    }
  }, [watchedDisplayName, profile?.displayName]);

  const isUpdating = isLinksFetching || addLinkMutation.isPending || editLinkMutation.isPending || deleteLinkMutation.isPending;

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center uppercase tracking-[0.2em] text-[10px] md:text-xs">
        LOADING MYLINK...
      </div>
    );
  }

  // 1. 비로그인 사용자 랜딩 뷰포트
  if (!user) {
    return (
      <div className="min-h-screen bg-white text-black flex flex-col items-center uppercase tracking-[0.1em] text-[11px] sm:text-xs md:text-sm lg:text-base transition-all duration-300 relative justify-center px-6">
        <header className="text-center max-w-md flex flex-col items-center gap-6">
          <h1 className="font-bold tracking-[0.25em] text-xl sm:text-2xl md:text-3xl">
            MYLINK
          </h1>
          <div className="w-[1px] h-8 md:h-12 bg-black"></div>
          
          <div className="opacity-80 leading-[2] tracking-wider text-[10px] md:text-xs font-light normal-case text-neutral-800 text-center mb-8">
            나만의 고유한 활동을 단정하게 모아보세요.
          </div>

          <button
            onClick={handleGoogleLogin}
            className="bg-black text-white px-8 py-3.5 text-[9px] md:text-[10px] font-bold hover:bg-black/80 transition-all tracking-[0.2em] flex items-center gap-3 border border-black"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16" className="w-3.5 h-3.5">
              <path d="M15.545 6.558a9.4 9.4 0 0 1 .139 1.626c0 2.434-.87 4.492-2.384 5.885h.002C11.978 15.292 10.158 16 8 16A8 8 0 1 1 8 0c2.2 0 4.053.807 5.513 2.164l-2.168 2.083C10.377 3.3 9.327 2.85 8 2.85c-2.856 0-5.178 2.378-5.178 5.15s2.322 5.15 5.178 5.15c3.15 0 4.757-2.186 4.957-3.645H8v-2.94z"/>
            </svg>
            GOOGLE SIGN IN
          </button>
        </header>

        <footer className="absolute bottom-12 text-center text-[8px] md:text-[9px] opacity-40 tracking-[0.2em] flex flex-col gap-2 mt-auto">
          <p>© {new Date().getFullYear()} MYLINK. ALL RIGHTS RESERVED.</p>
        </footer>
      </div>
    );
  }

  // 2. 로그인 사용자 관리자 마이페이지 뷰포트
  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center uppercase tracking-[0.1em] text-[11px] sm:text-xs md:text-sm lg:text-base transition-all duration-300 relative">
      
      {/* 네이버 블로그 스타일 최상단 툴바 (모바일 제외, sm 이상 뷰포트에서 화면 우측 상단 고정 노출) */}
      <div className="hidden sm:flex absolute top-6 right-6 md:right-12 gap-3 items-center z-30 tracking-[0.2em] text-[8px] md:text-[9px]">
        {/* 통계 페이지 바로가기 */}
        <Link
          href="/stats"
          className="border border-black bg-white text-black px-4 py-2 hover:bg-black hover:text-white transition-colors duration-300 font-bold"
        >
          STATISTICS
        </Link>

        {/* 내 페이지 바로가기 (Primary Solid Style) */}
        <a
          href={profile ? `/${profile.displayName}` : "#"}
          className="bg-black text-white px-4 py-2 hover:bg-black/80 transition-colors duration-300 font-bold border border-black"
        >
          내 페이지 바로가기
        </a>

        {/* 프로필 수정 (Secondary Style) */}
        <button
          onClick={() => {
            setIsProfileDialogOpen(true);
            setDuplicateError(null);
            setDuplicateSuccess(null);
            profileForm.reset({
              username: profile?.username || "",
              displayName: profile?.displayName || "",
              avatarUrl: profile?.avatarUrl || "",
              bio: profile?.bio || "",
            });
          }}
          className="border border-black bg-white text-black px-4 py-2 hover:bg-black hover:text-white transition-colors duration-300 font-bold"
        >
          EDIT PROFILE
        </button>

        {/* 로그아웃 버튼 */}
        <button
          onClick={handleLogout}
          className="border border-red-600 bg-white text-red-600 px-4 py-2 hover:bg-red-600 hover:text-white transition-colors duration-300 font-bold"
        >
          LOGOUT
        </button>
      </div>

      {/* Top Header */}
      <header className="w-full text-center pt-24 pb-16 md:pt-32 md:pb-24 flex flex-col items-center px-4">
        {/* 미니멀 아바타 아이콘 */}
        <div className="w-16 h-16 md:w-20 md:h-20 border border-black rounded-full flex items-center justify-center mb-6 opacity-80 bg-neutral-50/50 overflow-hidden">
          {profile?.avatarUrl ? (
            <img 
              key={profile.avatarUrl}
              src={profile.avatarUrl} 
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
          {isProfileLoading ? "LOADING..." : (profile?.username || "BORA JO")}
        </h1>
        <div className="w-[1px] h-8 md:h-12 lg:h-16 bg-black mx-auto mb-4 md:mb-6"></div>
        <p className="opacity-60 text-[10px] md:text-xs lg:text-sm tracking-[0.15em] normal-case">
          my-link.com/{isProfileLoading ? "loading" : (profile?.displayName || "bora_jo")}
        </p>

        {/* 모바일 대응 전용 버튼 (모바일 뷰포트에서 툴바 대신 하단 노출) */}
        <div className="flex sm:hidden flex-col gap-2 w-full max-w-xs mt-6 tracking-[0.25em]">
          <a
            href={profile ? `/${profile.displayName}` : "#"}
            className="bg-black text-white py-3 hover:bg-black/80 transition-colors duration-300 font-bold border border-black text-center text-[9px]"
          >
            내 페이지 바로가기
          </a>
          <div className="flex gap-2 w-full">
            <button
              onClick={() => {
                setIsProfileDialogOpen(true);
                setDuplicateError(null);
                setDuplicateSuccess(null);
                profileForm.reset({
                  username: profile?.username || "",
                  displayName: profile?.displayName || "",
                  avatarUrl: profile?.avatarUrl || "",
                  bio: profile?.bio || "",
                });
              }}
              className="flex-1 border border-black bg-white text-black py-3 hover:bg-black hover:text-white transition-colors duration-300 font-bold text-center text-[9px]"
            >
              EDIT PROFILE
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 border border-red-600 bg-white text-red-600 py-3 hover:bg-red-600 hover:text-white transition-colors duration-300 font-bold text-center text-[9px]"
            >
              LOGOUT
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-sm md:max-w-xl lg:max-w-3xl flex-1 flex flex-col px-6 md:px-12">
        
        {/* Intro / Bio */}
        {(profile?.bio || !isProfileLoading) && (
          <div className="text-center mb-16 md:mb-24 opacity-80 leading-[1.8] tracking-wider text-[11px] md:text-xs lg:text-sm font-light normal-case whitespace-pre-wrap">
            {profile?.bio || ""}
          </div>
        )}

        {/* Add Link Button */}
        <div className="w-full flex justify-center mb-6">
          <button 
            onClick={() => setIsDialogOpen(true)}
            className="border border-black px-6 py-3 text-[10px] md:text-xs hover:bg-black hover:text-white transition-colors duration-300 tracking-[0.2em] font-semibold"
          >
            + ADD LINK
          </button>
        </div>

        {/* Links List */}
        <div className="flex flex-col w-full gap-4 md:gap-6 border-t border-black pt-4 md:pt-8 lg:pt-12 mb-12 relative">
          {/* Refreshing Indicator */}
          {isUpdating && (
            <div className="absolute top-2 right-0 opacity-60 tracking-[0.2em] text-[8px] md:text-[9px] animate-pulse">
              UPDATING...
            </div>
          )}

          {isLinksLoading ? (
            <div className="text-center py-12 md:py-16 opacity-60 tracking-[0.15em] text-[10px] md:text-xs">
              LOADING LINKS...
            </div>
          ) : links.length === 0 ? (
            <div className="text-center py-12 md:py-16 opacity-60 tracking-[0.15em] text-[10px] md:text-xs">
              NO LINKS FOUND.
            </div>
          ) : (
            links.map((link) => {
              if (link.id === editingLinkId) {
                return (
                  <form
                    key={link.id}
                    onSubmit={editForm.handleSubmit(onEditSubmit)}
                    className="w-full border-b border-black py-6 md:py-8 lg:py-10 flex flex-col gap-6 transition-all duration-300 normal-case"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] md:text-xs font-bold tracking-[0.15em] uppercase">TITLE</label>
                        <input 
                          type="text" 
                          {...editForm.register("title")}
                          className={`border-b outline-none py-2 bg-transparent normal-case tracking-normal transition-colors ${editForm.formState.errors.title ? "border-red-500" : "border-black/20 focus:border-black"}`}
                          placeholder="e.g. My Portfolio"
                        />
                        {editForm.formState.errors.title && <span className="text-[8px] md:text-[10px] text-red-500 normal-case tracking-normal mt-1">{editForm.formState.errors.title.message}</span>}
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] md:text-xs font-bold tracking-[0.15em] uppercase">URL</label>
                        <input 
                          type="text" 
                          {...editForm.register("url")}
                          className={`border-b outline-none py-2 bg-transparent normal-case tracking-normal transition-colors ${editForm.formState.errors.url ? "border-red-500" : "border-black/20 focus:border-black"}`}
                          placeholder="e.g. https://portfolio.com"
                        />
                        {editForm.formState.errors.url && <span className="text-[8px] md:text-[10px] text-red-500 normal-case tracking-normal mt-1">{editForm.formState.errors.url.message}</span>}
                      </div>
                    </div>

                    <div className="flex gap-4 justify-end">
                      <button 
                        type="button"
                        onClick={() => setEditingLinkId(null)}
                        disabled={editForm.formState.isSubmitting}
                        className="border border-black px-6 py-2 hover:bg-black/5 transition-colors duration-300 tracking-[0.2em] font-bold text-[9px] md:text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        CANCEL
                      </button>
                      <button 
                        type="submit"
                        disabled={editForm.formState.isSubmitting}
                        className="bg-black text-white border border-black px-6 py-2 hover:bg-white hover:text-black transition-colors duration-300 tracking-[0.2em] font-bold text-[9px] md:text-[10px] flex items-center justify-center min-w-[70px] min-h-[30px] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {editForm.formState.isSubmitting ? (
                          <svg className="animate-spin h-3.5 w-3.5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : "SAVE"}
                      </button>
                    </div>
                  </form>
                );
              }

              return (
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

                    {/* 조회수 시각화 (눈 모양 SVG + 숫자, 0뷰 보장) */}
                    <div className="flex items-center gap-1 opacity-45 group-hover:opacity-85 transition-opacity text-[9px] md:text-[10px] normal-case ml-2">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 md:w-4 md:h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                      <span className="font-medium tracking-normal">
                        {link.clicks !== undefined && link.clicks !== null ? link.clicks : 0}
                      </span>
                    </div>
                  </div>

                  {/* Action Gear Button & Dropdown */}
                  <div className="absolute right-4 md:right-8 z-10 flex items-center">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === link.id ? null : link.id);
                      }}
                      className="p-2 hover:opacity-60 transition-opacity group/gear"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 md:w-5 md:h-5 transition-transform duration-500 group-hover/gear:rotate-90">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.936 6.936 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                    </button>

                    {/* Dropdown Menu */}
                    {activeMenuId === link.id && (
                      <div className="absolute right-0 top-full mt-2 w-28 bg-white border border-black z-20 flex flex-col uppercase text-[9px] md:text-[10px] tracking-widest">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleOpenInlineEdit(link);
                            setActiveMenuId(null);
                          }}
                          className="w-full text-left py-3 px-4 hover:bg-black/5 transition-colors border-b border-black/10 font-bold"
                        >
                          EDIT
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeletingLink(link);
                            setActiveMenuId(null);
                          }}
                          className="w-full text-left py-3 px-4 hover:bg-red-50 text-red-500 transition-colors font-bold"
                        >
                          DELETE
                        </button>
                      </div>
                    )}
                  </div>
                </a>
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

      {/* Add Link Dialog */}
      {isDialogOpen && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form 
            onSubmit={addForm.handleSubmit(onAddSubmit)}
            className="bg-white border border-black w-full max-w-md p-8 md:p-10 flex flex-col gap-8 transition-all"
          >
            <h2 className="text-center font-bold tracking-[0.2em] text-lg md:text-xl border-b border-black pb-4">ADD NEW LINK</h2>
            
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] md:text-xs font-bold tracking-[0.15em]">TITLE</label>
                <input 
                  type="text" 
                  {...addForm.register("title")}
                  className={`border-b outline-none py-2 bg-transparent normal-case tracking-normal transition-colors ${addForm.formState.errors.title ? "border-red-500" : "border-black/20 focus:border-black"}`}
                  placeholder="e.g. My Portfolio"
                />
                {addForm.formState.errors.title && <span className="text-[8px] md:text-[10px] text-red-500 normal-case tracking-normal mt-1">{addForm.formState.errors.title.message}</span>}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] md:text-xs font-bold tracking-[0.15em]">URL</label>
                <input 
                  type="text" 
                  {...addForm.register("url")}
                  className={`border-b outline-none py-2 bg-transparent normal-case tracking-normal transition-colors ${addForm.formState.errors.url ? "border-red-500" : "border-black/20 focus:border-black"}`}
                  placeholder="e.g. https://portfolio.com"
                />
                {addForm.formState.errors.url && <span className="text-[8px] md:text-[10px] text-red-500 normal-case tracking-normal mt-1">{addForm.formState.errors.url.message}</span>}
              </div>
            </div>

            <div className="flex gap-4 mt-4">
              <button 
                type="button"
                onClick={handleCloseDialog}
                disabled={addLinkMutation.isPending}
                className="flex-1 border border-black py-4 hover:bg-black/5 transition-colors duration-300 tracking-[0.2em] font-bold text-[10px] md:text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                CANCEL
              </button>
              <button 
                type="submit"
                disabled={addLinkMutation.isPending}
                className="flex-1 bg-black text-white border border-black py-4 hover:bg-white hover:text-black transition-colors duration-300 tracking-[0.2em] font-bold text-[10px] md:text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[50px]"
              >
                {addLinkMutation.isPending ? (
                  <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : "ADD"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deletingLink && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="bg-white border border-black w-full max-w-md p-8 md:p-10 flex flex-col gap-8 transition-all"
          >
            <h2 className="text-center font-bold tracking-[0.2em] text-lg md:text-xl border-b border-black pb-4">
              정말 삭제하시겠습니까?
            </h2>
            
            <div className="flex flex-col gap-4 text-center">
              <span className="font-semibold tracking-[0.15em] text-xs md:text-sm normal-case border-b border-black/10 pb-4">
                {deletingLink.title}
              </span>
              <p className="text-red-500 font-bold tracking-[0.15em] text-[10px] md:text-xs uppercase mt-2">
                이 작업은 되돌릴 수 없습니다
              </p>
            </div>

            <div className="flex gap-4 mt-4">
              <button 
                type="button"
                onClick={() => setDeletingLink(null)}
                disabled={deleteLinkMutation.isPending}
                className="flex-1 border border-black py-4 hover:bg-black/5 transition-colors duration-300 tracking-[0.2em] font-bold text-[10px] md:text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                CANCEL
              </button>
              <button 
                type="button"
                onClick={confirmDeleteLink}
                disabled={deleteLinkMutation.isPending}
                className="flex-1 bg-red-600 text-white border border-red-600 py-4 hover:bg-white hover:text-red-600 transition-colors duration-300 tracking-[0.2em] font-bold text-[10px] md:text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[50px]"
              >
                {deleteLinkMutation.isPending ? (
                  <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : "DELETE"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Dialog */}
      {isProfileDialogOpen && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form 
            onSubmit={profileForm.handleSubmit(onProfileSubmit)}
            className="bg-white border border-black w-full max-w-md p-8 md:p-10 flex flex-col gap-8 transition-all"
          >
            <h2 className="text-center font-bold tracking-[0.2em] text-lg md:text-xl border-b border-black pb-4">EDIT PROFILE</h2>
            
            <div className="flex flex-col gap-6">
              {/* 프로필 이미지 편집 영역 */}
              <div className="flex flex-col items-center gap-4 mb-2">
                <label className="text-[10px] md:text-xs font-bold tracking-[0.15em] uppercase text-center w-full">PROFILE PICTURE</label>
                <div className="relative group/avatar w-20 h-20 md:w-24 md:h-24 border border-black rounded-full flex items-center justify-center bg-neutral-50/50 overflow-hidden">
                  {profileForm.watch("avatarUrl") ? (
                    <img 
                      src={profileForm.watch("avatarUrl")} 
                      alt="Avatar Preview" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={0.8} stroke="currentColor" className="w-8 h-8 md:w-10 md:h-10 opacity-40">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                  )}
                  {/* 오버레이 업로드 단추 */}
                  <label className={`absolute inset-0 transition-opacity duration-300 flex items-center justify-center text-white text-[8px] md:text-[9px] font-bold tracking-widest uppercase ${isUploadingAvatar ? "bg-black/60 opacity-100 cursor-wait" : "bg-black/40 opacity-0 group-hover/avatar:opacity-100 cursor-pointer"}`}>
                    {isUploadingAvatar ? "UPLOADING..." : "CHANGE"}
                    <input 
                      type="file" 
                      accept="image/*"
                      className="hidden"
                      disabled={isUploadingAvatar}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 10 * 1024 * 1024) {
                            toast.error("파일 크기가 10MB를 초과합니다.");
                            return;
                          }
                          if (!user?.uid) {
                            toast.error("로그인이 필요합니다.");
                            return;
                          }
                          try {
                            setIsUploadingAvatar(true);
                            toast.info("이미지를 업로드하는 중입니다...");
                            const timestamp = Date.now();
                            const storageRef = ref(storage, `avatars/${user.uid}/${timestamp}_${file.name}`);
                            await uploadBytes(storageRef, file);
                            const downloadURL = await getDownloadURL(storageRef);
                            
                            // 1) 폼 값 업데이트
                            profileForm.setValue("avatarUrl", downloadURL, { shouldDirty: true });
                            
                            // 2) Firestore에 즉시 저장
                            const { doc: firestoreDoc, updateDoc: firestoreUpdateDoc } = await import("firebase/firestore");
                            const profileDocRef = firestoreDoc(db, "users", user.uid);
                            await firestoreUpdateDoc(profileDocRef, {
                              avatarUrl: downloadURL,
                              updatedAt: new Date().toISOString(),
                            });
                            
                            // 3) React Query 캐시 갱신
                            queryClient.setQueryData<Profile>(["profile", user.uid], (old) => {
                              if (!old) return old;
                              return { ...old, avatarUrl: downloadURL };
                            });
                            queryClient.invalidateQueries({ queryKey: ["profile", user.uid] });
                            
                            toast.success("프로필 이미지가 성공적으로 변경되었습니다!");
                          } catch (error) {
                            console.error("Avatar upload error:", error);
                            toast.error("이미지 업로드에 실패했습니다.");
                          } finally {
                            setIsUploadingAvatar(false);
                          }
                        }
                      }}
                    />
                  </label>
                </div>
                {profileForm.watch("avatarUrl") && (
                  <button
                    type="button"
                    onClick={() => {
                      profileForm.setValue("avatarUrl", "", { shouldDirty: true });
                      toast.info("프로필 이미지가 기본값으로 설정되었습니다.");
                    }}
                    className="text-red-500 hover:text-red-700 text-[8px] md:text-[9px] font-bold tracking-[0.1em] uppercase transition-colors"
                  >
                    REMOVE PICTURE
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] md:text-xs font-bold tracking-[0.15em] uppercase">USERNAME</label>
                <input 
                  type="text" 
                  {...profileForm.register("username")}
                  className={`border-b outline-none py-2 bg-transparent normal-case tracking-normal transition-colors ${profileForm.formState.errors.username ? "border-red-500" : "border-black/20 focus:border-black"}`}
                  placeholder="e.g. BORA JO"
                />
                {profileForm.formState.errors.username && <span className="text-[8px] md:text-[10px] text-red-500 normal-case tracking-normal mt-1">{profileForm.formState.errors.username.message}</span>}
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-[10px] md:text-xs font-bold tracking-[0.15em] uppercase">DISPLAY NAME (URL SLUG)</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    {...profileForm.register("displayName")}
                    className={`flex-1 border-b outline-none py-2 bg-transparent normal-case tracking-normal transition-colors ${profileForm.formState.errors.displayName ? "border-red-500" : "border-black/20 focus:border-black"}`}
                    placeholder="e.g. bora_jo"
                  />
                  <button
                    type="button"
                    onClick={() => checkDisplayName(profileForm.getValues("displayName"))}
                    disabled={isCheckingDuplicate}
                    className="border border-black px-4 py-2 text-[9px] md:text-[10px] hover:bg-black hover:text-white transition-colors duration-300 tracking-[0.1em] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCheckingDuplicate ? "CHECKING..." : "DUPLICATE CHECK"}
                  </button>
                </div>
                {profileForm.formState.errors.displayName && <span className="text-[8px] md:text-[10px] text-red-500 normal-case tracking-normal mt-1">{profileForm.formState.errors.displayName.message}</span>}
                {duplicateError && <span className="text-[8px] md:text-[10px] text-red-500 normal-case tracking-normal mt-1">{duplicateError}</span>}
                {duplicateSuccess && <span className="text-[8px] md:text-[10px] text-green-600 normal-case tracking-normal mt-1">{duplicateSuccess}</span>}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] md:text-xs font-bold tracking-[0.15em] uppercase">BIO (소개글)</label>
                  <span className={`text-[8px] md:text-[9px] tracking-normal normal-case ${(profileForm.watch("bio") || "").length > 150 ? "text-red-500" : "text-black/40"}`}>
                    {(profileForm.watch("bio") || "").length} / 150
                  </span>
                </div>
                <textarea
                  {...profileForm.register("bio")}
                  className={`border-b outline-none py-2 bg-transparent normal-case tracking-normal transition-colors resize-none text-[11px] md:text-xs leading-relaxed ${profileForm.formState.errors.bio ? "border-red-500" : "border-black/20 focus:border-black"}`}
                  placeholder="간단한 소개글을 입력해주세요. (최대 150자)"
                  rows={3}
                />
                {profileForm.formState.errors.bio && <span className="text-[8px] md:text-[10px] text-red-500 normal-case tracking-normal mt-1">{profileForm.formState.errors.bio.message}</span>}
              </div>
            </div>

            <div className="flex gap-4 mt-4">
              <button 
                type="button"
                onClick={() => setIsProfileDialogOpen(false)}
                disabled={updateProfileMutation.isPending}
                className="flex-1 border border-black py-4 hover:bg-black/5 transition-colors duration-300 tracking-[0.2em] font-bold text-[10px] md:text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                CANCEL
              </button>
              <button 
                type="submit"
                disabled={
                  updateProfileMutation.isPending || 
                  !!duplicateError || 
                  (!duplicateSuccess && profileForm.getValues("displayName") !== profile?.displayName)
                }
                className="flex-1 bg-black text-white border border-black py-4 hover:bg-white hover:text-black transition-colors duration-300 tracking-[0.2em] font-bold text-[10px] md:text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[50px]"
              >
                {updateProfileMutation.isPending ? (
                  <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : "SAVE"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
