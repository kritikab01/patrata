import { Link } from 'react-router-dom'
import { ExternalLink, FilePlus2 } from 'lucide-react'
import { criteriaLines, isAssumption, useBook } from '../lib/products'
import { Button, Card, PageHead, Skeleton } from '../components/ui'

/** The product book: every variant's rules and where each number comes from. */
export default function Products() {
  const book = useBook()
  return (
    <>
      <PageHead title="Product catalogue" sub="Every loan variant Patrata screens, its rules, and where each number comes from. Values marked ‡ are Patrata's own policy assumptions where no single published figure exists."
        right={<Link to="/new"><Button><FilePlus2 size={18} />New application</Button></Link>} />
      {!book ? <Skeleton className="h-96 w-full rounded-[14px]" /> : (
        <div className="space-y-8">
          {book.products.map((p) => (
            <section key={p.id}>
              <div className="mb-3 flex flex-wrap items-baseline gap-3">
                <h2 className="text-[22px] font-extrabold">{p.name}</h2>
                <span className="rounded border border-line px-2 py-0.5 text-[12px] text-muted">{p.secured ? 'Secured' : 'Unsecured'}</span>
              </div>
              <p className="mb-3 max-w-3xl text-muted">{p.summary}</p>
              <div className="grid gap-4 lg:grid-cols-2">
                {p.variants.map((v) => (
                  <Card key={v.id} className="flex flex-col">
                    <h3 className="text-[17px] font-extrabold">{v.name}</h3>
                    <p className="mt-1 text-sm text-muted">{v.for}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">{v.features.map((f) => <span key={f} className="rounded-full bg-brand-bg px-2 py-0.5 text-[12px] text-brand">{f}</span>)}</div>
                    <table className="mt-4 w-full text-[13px]">
                      <tbody>
                        {criteriaLines(v).map((l) => (
                          <tr key={l.k}><th scope="row" className="w-[38%] border-b border-line-2 py-1.5 pr-2 text-left font-medium text-muted">{l.label}</th>
                            <td className="border-b border-line-2 py-1.5">{l.value}{isAssumption(v, l.k) && <span title="Patrata policy assumption" className="ml-1 text-warn">‡</span>}</td></tr>
                        ))}
                        <tr><th scope="row" className="border-b border-line-2 py-1.5 pr-2 text-left font-medium text-muted">Indicative rate</th>
                          <td className="border-b border-line-2 py-1.5">{v.criteria.rate_range[0] === v.criteria.rate_range[1] ? `${v.criteria.rate_range[0]}%` : `${v.criteria.rate_range[0]}% to ${v.criteria.rate_range[1]}% a year`}{isAssumption(v, 'rate_range') && <span className="ml-1 text-warn">‡</span>}</td></tr>
                      </tbody>
                    </table>
                    {v.special && <p className="mt-3 rounded-[10px] bg-paper p-3 text-[13px]"><b>Special rule.</b> {v.special.rule}</p>}
                    <p className="mt-3 text-[13px]"><b>Documents:</b> {v.documents.join(', ')}.</p>
                    <div className="mt-3 border-t border-line-2 pt-3">
                      <p className="mb-1 text-[12px] font-semibold text-muted">Sources</p>
                      <ul className="space-y-1">{v.sources.map((s) => (
                        <li key={s.url + s.label}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-[12px] text-muted underline hover:text-ink">{s.label}<ExternalLink size={11} className="mt-0.5 shrink-0" /></a></li>
                      ))}</ul>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
          <p className="text-[13px] text-muted">{book.note} Product book version {book.version}.</p>
        </div>
      )}
    </>
  )
}
