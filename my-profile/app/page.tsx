"use client";

import { useState, useEffect } from "react";
import { LinkItem } from "../Data/links";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { db } from "../lib/firebase";
import { collection, addDoc, getDocs, query, orderBy } from "firebase/firestore";

const linkSchema = z.object({
  title: z.string().min(1, "Title is required"),
  url: z.string().url("Invalid URL format").min(1, "URL is required"),
});

type LinkFormValues = z.infer<typeof linkSchema>;

export default function Home() {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LinkFormValues>({
    resolver: zodResolver(linkSchema),
    defaultValues: {
      title: "",
      url: "",
    },
  });

  const fetchLinks = async (isInitial = false) => {
    try {
      if (isInitial) {
        setIsInitialLoading(true);
      } else {
        setIsUpdating(true);
      }
      const q = query(collection(db, "users/anonymous/links"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      const linksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LinkItem[];
      setLinks(linksData);
    } catch (error) {
      console.error("Error fetching documents: ", error);
    } finally {
      setIsInitialLoading(false);
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    fetchLinks(true);
  }, []);

  const onSubmit = async (data: LinkFormValues) => {
    try {
      await addDoc(collection(db, "users/anonymous/links"), {
        title: data.title.trim(),
        url: data.url.trim(),
        createdAt: new Date().toISOString(),
      });
      setIsDialogOpen(false);
      reset();
      await fetchLinks();
    } catch (error) {
      console.error("Error adding document: ", error);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    reset();
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center uppercase tracking-[0.1em] text-[11px] sm:text-xs md:text-sm lg:text-base transition-all duration-300 relative">
      {/* Top Header */}
      <header className="w-full text-center pt-24 pb-16 md:pt-32 md:pb-24">
        <h1 className="font-bold tracking-[0.2em] text-lg sm:text-xl md:text-2xl lg:text-3xl mb-4 md:mb-6">BORA JO</h1>
        <div className="w-[1px] h-8 md:h-12 lg:h-16 bg-black mx-auto mb-4 md:mb-6"></div>
        <p className="opacity-60 text-[10px] md:text-xs lg:text-sm tracking-[0.15em]">CLOTHING & TEXTILES</p>
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

          {isInitialLoading ? (
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
                <span className="absolute right-4 md:right-8 opacity-0 group-hover:opacity-100 transition-opacity duration-300 md:text-lg">↗</span>
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

      {/* Add Link Dialog */}
      {isDialogOpen && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form 
            onSubmit={handleSubmit(onSubmit)}
            className="bg-white border border-black w-full max-w-md p-8 md:p-10 flex flex-col gap-8 transition-all"
          >
            <h2 className="text-center font-bold tracking-[0.2em] text-lg md:text-xl border-b border-black pb-4">ADD NEW LINK</h2>
            
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] md:text-xs font-bold tracking-[0.15em]">TITLE</label>
                <input 
                  type="text" 
                  {...register("title")}
                  className={`border-b outline-none py-2 bg-transparent normal-case tracking-normal transition-colors ${errors.title ? "border-red-500" : "border-black/20 focus:border-black"}`}
                  placeholder="e.g. My Portfolio"
                />
                {errors.title && <span className="text-[8px] md:text-[10px] text-red-500 normal-case tracking-normal mt-1">{errors.title.message}</span>}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] md:text-xs font-bold tracking-[0.15em]">URL</label>
                <input 
                  type="text" 
                  {...register("url")}
                  className={`border-b outline-none py-2 bg-transparent normal-case tracking-normal transition-colors ${errors.url ? "border-red-500" : "border-black/20 focus:border-black"}`}
                  placeholder="e.g. https://portfolio.com"
                />
                {errors.url && <span className="text-[8px] md:text-[10px] text-red-500 normal-case tracking-normal mt-1">{errors.url.message}</span>}
              </div>
            </div>

            <div className="flex gap-4 mt-4">
              <button 
                type="button"
                onClick={handleCloseDialog}
                disabled={isSubmitting}
                className="flex-1 border border-black py-4 hover:bg-black/5 transition-colors duration-300 tracking-[0.2em] font-bold text-[10px] md:text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                CANCEL
              </button>
              <button 
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-black text-white border border-black py-4 hover:bg-white hover:text-black transition-colors duration-300 tracking-[0.2em] font-bold text-[10px] md:text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "ADDING..." : "ADD"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
