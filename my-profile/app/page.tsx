"use client";

import { useState, useEffect } from "react";
import { LinkItem } from "../Data/links";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { db } from "../lib/firebase";
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
  where 
} from "firebase/firestore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const linkSchema = z.object({
  title: z.string().min(1, "Title is required"),
  url: z.string().url("Invalid URL format").min(1, "URL is required"),
});

const profileSchema = z.object({
  username: z.string().min(1, "Username is required"),
  displayName: z.string()
    .min(1, "Display name is required")
    .regex(/^[a-zA-Z0-9_-]+$/, "영문, 숫자, 하이픈(-), 언더바(_)만 가능합니다."),
});

type LinkFormValues = z.infer<typeof linkSchema>;
type ProfileFormValues = z.infer<typeof profileSchema>;

interface Profile {
  uid: string;
  email: string;
  displayName: string;
  username: string;
  createdAt: string;
}

export default function Home() {
  const queryClient = useQueryClient();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [deletingLink, setDeletingLink] = useState<LinkItem | null>(null);

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
    },
  });

  // 1. 프로필 Query
  const { data: profile, isLoading: isProfileLoading } = useQuery<Profile>({
    queryKey: ["profile"],
    queryFn: async () => {
      const docRef = doc(db, "users", "anonymous");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as Profile;
      } else {
        const defaultProfile: Profile = {
          uid: "anonymous",
          email: "anonymous@gmail.com",
          displayName: "bora_jo",
          username: "BORA JO",
          createdAt: new Date().toISOString(),
        };
        await setDoc(docRef, defaultProfile);
        return defaultProfile;
      }
    },
  });

  // 2. 링크 Query
  const { data: links = [], isLoading: isLinksLoading, isFetching: isLinksFetching } = useQuery<LinkItem[]>({
    queryKey: ["links"],
    queryFn: async () => {
      const q = query(collection(db, "users/anonymous/links"), orderBy("createdAt", "asc"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LinkItem[];
    },
  });

  // 3. 링크 추가 Mutation
  const addLinkMutation = useMutation({
    mutationFn: async (data: LinkFormValues) => {
      await addDoc(collection(db, "users/anonymous/links"), {
        title: data.title.trim(),
        url: data.url.trim(),
        createdAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      setIsDialogOpen(false);
      addForm.reset();
      queryClient.invalidateQueries({ queryKey: ["links"] });
    },
    onError: (error) => {
      console.error("Error adding link:", error);
    }
  });

  // 4. 링크 수정 Mutation
  const editLinkMutation = useMutation({
    mutationFn: async (data: LinkFormValues & { id: string }) => {
      const linkDocRef = doc(db, "users/anonymous/links", data.id);
      await updateDoc(linkDocRef, {
        title: data.title.trim(),
        url: data.url.trim(),
        updatedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      setEditingLinkId(null);
      editForm.reset();
      queryClient.invalidateQueries({ queryKey: ["links"] });
    },
    onError: (error) => {
      console.error("Error updating link:", error);
    }
  });

  // 5. 링크 삭제 Mutation
  const deleteLinkMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, "users/anonymous/links", id));
    },
    onSuccess: () => {
      if (editingLinkId === deletingLink?.id) {
        setEditingLinkId(null);
      }
      setDeletingLink(null);
      queryClient.invalidateQueries({ queryKey: ["links"] });
    },
    onError: (error) => {
      console.error("Error deleting link:", error);
    }
  });

  // 6. 프로필 수정 Mutation (Optimistic Update)
  const updateProfileMutation = useMutation({
    mutationFn: async (newProfile: ProfileFormValues) => {
      const profileDocRef = doc(db, "users", "anonymous");
      await updateDoc(profileDocRef, {
        username: newProfile.username.trim(),
        displayName: newProfile.displayName.trim(),
        updatedAt: new Date().toISOString(),
      });
    },
    onMutate: async (newProfile) => {
      await queryClient.cancelQueries({ queryKey: ["profile"] });
      const previousProfile = queryClient.getQueryData<Profile>(["profile"]);
      
      queryClient.setQueryData<Profile>(["profile"], (old) => {
        if (!old) return old;
        return {
          ...old,
          username: newProfile.username,
          displayName: newProfile.displayName,
        };
      });

      return { previousProfile };
    },
    onError: (err, newProfile, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData(["profile"], context.previousProfile);
      }
      console.error("Error updating profile:", err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onSuccess: () => {
      setIsProfileDialogOpen(false);
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
      const isDup = snapshot.docs.some(doc => doc.id !== "anonymous");

      if (isDup) {
        setDuplicateError("이미 사용 중인 디스플레이 네임입니다.");
      } else {
        setDuplicateSuccess("사용 가능한 디스플레이 네임입니다.");
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

  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center uppercase tracking-[0.1em] text-[11px] sm:text-xs md:text-sm lg:text-base transition-all duration-300 relative">
      {/* 네이버 블로그 스타일 최상단 툴바 (모바일 제외, sm 이상 뷰포트에서 화면 우측 상단 고정 노출) */}
      <div className="hidden sm:flex absolute top-6 right-6 md:right-12 gap-3 items-center z-30 tracking-[0.2em] text-[8px] md:text-[9px]">
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
            });
          }}
          className="border border-black bg-white text-black px-4 py-2 hover:bg-black hover:text-white transition-colors duration-300 font-bold"
        >
          EDIT PROFILE
        </button>
      </div>

      {/* Top Header */}
      <header className="w-full text-center pt-24 pb-16 md:pt-32 md:pb-24 flex flex-col items-center px-4">
        {/* 미니멀 아바타 아이콘 */}
        <div className="w-16 h-16 md:w-20 md:h-20 border border-black rounded-full flex items-center justify-center mb-6 opacity-80 bg-neutral-50/50">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={0.8} stroke="currentColor" className="w-8 h-8 md:w-10 md:h-10">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
        </div>

        <h1 className="font-bold tracking-[0.2em] text-lg sm:text-xl md:text-2xl lg:text-3xl mb-4 md:mb-6">
          {isProfileLoading ? "LOADING..." : (profile?.username || "BORA JO")}
        </h1>
        <div className="w-[1px] h-8 md:h-12 lg:h-16 bg-black mx-auto mb-4 md:mb-6"></div>
        <p className="opacity-60 text-[10px] md:text-xs lg:text-sm tracking-[0.15em] normal-case">
          my-link.com/{isProfileLoading ? "loading" : (profile?.displayName || "bora_jo")}
        </p>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-sm md:max-w-xl lg:max-w-3xl flex-1 flex flex-col px-6 md:px-12">
        
        {/* Intro / Bio */}
        <div className="text-center mb-16 md:mb-24 opacity-80 leading-[1.8] tracking-wider text-[11px] md:text-xs lg:text-sm font-light normal-case">
          안녕하세요. 바이브코딩을 배우고 있는 의류학과 학생입니다.
        </div>

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
                disabled={addForm.formState.isSubmitting}
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
