import { Hammer } from 'lucide-react'

export default async function UnderConstructionPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const resolvedParams = await params
  const pageName = resolvedParams.slug.join(' ').replace(/-/g, ' ')
  
  return (
    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-slate-500">
      <div className="w-20 h-20 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center">
        <Hammer size={40} className="text-slate-400" />
      </div>
      <div>
        <h2 className="text-2xl font-black text-[#111827] capitalize mb-2">{pageName}</h2>
        <p>Halaman ini sedang dalam tahap pengembangan (Prototype).</p>
      </div>
    </div>
  )
}
