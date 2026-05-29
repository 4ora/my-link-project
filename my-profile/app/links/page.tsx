import { dummyLinks } from "../../Data/links";

export default function LinksPage() {
  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center p-6 md:p-12 uppercase tracking-[0.1em] text-[11px] sm:text-xs md:text-sm lg:text-base">
      <main className="w-full max-w-sm md:max-w-xl lg:max-w-3xl flex-1 flex flex-col justify-center mt-12 md:mt-24">
        
        {/* 헤더 섹션 */}
        <h1 className="text-center font-bold tracking-[0.2em] text-lg sm:text-xl md:text-2xl lg:text-3xl mb-8">
          링크 목록 (LINKS)
        </h1>
        <div className="w-[1px] h-8 md:h-12 bg-black mx-auto mb-12"></div>
        
        {/* 링크 목록 섹션 */}
        <div className="flex flex-col w-full gap-4 md:gap-6 border-t border-black pt-8">
          {dummyLinks.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex justify-between items-center w-full py-4 md:py-6 lg:py-8 border-b border-black hover:px-4 md:hover:px-8 transition-all duration-300 ease-in-out"
            >
              <div className="flex items-center gap-4">
                <img 
                  src={`https://s2.googleusercontent.com/s2/favicons?domain=${link.url}&sz=64`} 
                  alt={`${link.title} 아이콘`} 
                  className="w-4 h-4 md:w-5 md:h-5 grayscale group-hover:grayscale-0 transition-all duration-300 opacity-80 group-hover:opacity-100"
                />
                <span className="font-semibold tracking-[0.15em] md:text-sm lg:text-base">{link.title}</span>
              </div>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 md:text-lg">↗</span>
            </a>
          ))}
        </div>

      </main>
    </div>
  );
}
