'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Edit3, Save, X, Eye, EyeOff,
  Tag, Users, ChevronDown, ChevronRight
} from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import {
  createCategory, updateCategory, deleteCategory,
  createCategoryItem, updateCategoryItem, deleteCategoryItem,
} from '../settings-actions'
import type { FinanceCategory, CategoryItem, StaffProfile } from '../settings-actions'

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280',
]

const DETAIL_MODES = [
  { value: 'none', labelEn: 'Free Text', labelTh: 'พิมพ์เอง' },
  { value: 'custom', labelEn: 'Custom List', labelTh: 'กำหนดเอง' },
  { value: 'staff', labelEn: 'Staff Members', labelTh: 'รายชื่อพนักงาน' },
]

interface Props {
  categories: FinanceCategory[]
  categoryItems: CategoryItem[]
  staffProfiles: StaffProfile[]
}

export default function FinanceSettingsView({ categories, categoryItems, staffProfiles }: Props) {
  const router = useRouter()
  const { locale } = useLocale()
  const [isPending, startTransition] = useTransition()
  const isEn = locale === 'en'

  // -- Category state --
  const [showAddCat, setShowAddCat] = useState(false)
  const [newValue, setNewValue] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newLabelTh, setNewLabelTh] = useState('')
  const [newColor, setNewColor] = useState('#6b7280')
  const [newDetailSource, setNewDetailSource] = useState('none')
  const [editCatId, setEditCatId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editLabelTh, setEditLabelTh] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editDetailSource, setEditDetailSource] = useState('none')

  // -- Expandable category for items --
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null)
  const [addingItemToCat, setAddingItemToCat] = useState<string | null>(null)
  const [newItemLabel, setNewItemLabel] = useState('')
  const [editItemId, setEditItemId] = useState<string | null>(null)
  const [editItemLabel, setEditItemLabel] = useState('')

  const [error, setError] = useState<string | null>(null)

  const inputCls = "w-full px-2.5 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-emerald-500/30"

  // ==================== Category Handlers ====================
  const handleAddCat = () => {
    if (!newValue || !newLabel || !newLabelTh) return
    setError(null)
    startTransition(async () => {
      const result = await createCategory({
        value: newValue.toLowerCase().replace(/\s+/g, '_'),
        label: newLabel, label_th: newLabelTh,
        color: newColor, detail_source: newDetailSource,
      })
      if (result.error) setError(result.error)
      else {
        setShowAddCat(false); setNewValue(''); setNewLabel(''); setNewLabelTh('')
        setNewColor('#6b7280'); setNewDetailSource('none'); router.refresh()
      }
    })
  }
  const handleEditCat = (cat: FinanceCategory) => {
    setEditCatId(cat.id); setEditLabel(cat.label); setEditLabelTh(cat.label_th)
    setEditColor(cat.color); setEditDetailSource(cat.detail_source || 'none')
  }
  const handleSaveCat = () => {
    if (!editCatId) return
    startTransition(async () => {
      await updateCategory(editCatId, { label: editLabel, label_th: editLabelTh, color: editColor, detail_source: editDetailSource })
      setEditCatId(null); router.refresh()
    })
  }
  const handleToggleCat = (cat: FinanceCategory) => {
    startTransition(async () => { await updateCategory(cat.id, { is_active: !cat.is_active }); router.refresh() })
  }
  const handleDeleteCat = (cat: FinanceCategory) => {
    if (!confirm(isEn ? `Delete "${cat.label}"?` : `ลบหมวด "${cat.label_th}"?`)) return
    startTransition(async () => { const r = await deleteCategory(cat.id); if (r.error) setError(r.error); else router.refresh() })
  }

  // ==================== Category Item Handlers ====================
  const handleAddItem = (catId: string) => {
    if (!newItemLabel) return
    startTransition(async () => {
      const r = await createCategoryItem({ category_id: catId, label: newItemLabel })
      if (r.error) setError(r.error)
      else { setAddingItemToCat(null); setNewItemLabel(''); router.refresh() }
    })
  }
  const handleEditItem = (item: CategoryItem) => {
    setEditItemId(item.id); setEditItemLabel(item.label)
  }
  const handleSaveItem = () => {
    if (!editItemId) return
    startTransition(async () => {
      await updateCategoryItem(editItemId, { label: editItemLabel })
      setEditItemId(null); router.refresh()
    })
  }
  const handleDeleteItem = (item: CategoryItem) => {
    if (!confirm(isEn ? `Delete "${item.label}"?` : `ลบ "${item.label}"?`)) return
    startTransition(async () => { const r = await deleteCategoryItem(item.id); if (r.error) setError(r.error); else router.refresh() })
  }

  // Mode badge
  const getModeBadge = (source: string) => {
    if (source === 'staff') return { text: isEn ? 'Staff' : 'พนักงาน', cls: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30', icon: <Users className="h-2.5 w-2.5" /> }
    if (source === 'custom') return { text: isEn ? 'Custom' : 'กำหนดเอง', cls: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30', icon: <Tag className="h-2.5 w-2.5" /> }
    return { text: isEn ? 'Free text' : 'พิมพ์เอง', cls: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800', icon: null }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          {isEn ? 'Finance Settings' : 'ตั้งค่าการเงิน'}
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          {isEn ? 'Manage expense categories and their dropdown options' : 'จัดการหมวดค่าใช้จ่าย และรายการ dropdown ของแต่ละหมวด'}
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg text-red-600 text-sm">{error}</div>
      )}

      {/* ==================== SECTION 1: Categories ==================== */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{isEn ? 'Expense Categories' : 'หมวดค่าใช้จ่าย'}</span>
            <span className="text-xs text-zinc-400">({categories.length})</span>
          </div>
          <button onClick={() => setShowAddCat(true)} disabled={showAddCat}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" />{isEn ? 'Add' : 'เพิ่มหมวด'}
          </button>
        </div>

        {/* Add Category Form */}
        {showAddCat && (
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-emerald-50/30 dark:bg-emerald-950/10 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-medium text-zinc-500 uppercase">{isEn ? 'Key' : 'คีย์'}</label>
                <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="e.g. transport" className={inputCls} />
              </div>
              <div>
                <label className="text-[10px] font-medium text-zinc-500 uppercase">{isEn ? 'Label EN' : 'ชื่อ EN'}</label>
                <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Transport" className={inputCls} />
              </div>
              <div>
                <label className="text-[10px] font-medium text-zinc-500 uppercase">{isEn ? 'Label TH' : 'ชื่อ TH'}</label>
                <input value={newLabelTh} onChange={e => setNewLabelTh(e.target.value)} placeholder="ค่าขนส่ง" className={inputCls} />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setNewColor(c)}
                  className={`h-6 w-6 rounded-full border-2 transition-all ${newColor === c ? 'border-zinc-900 dark:border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <div>
              <label className="text-[10px] font-medium text-zinc-500 uppercase mb-1 block">{isEn ? 'Description Mode' : 'รายละเอียด'}</label>
              <div className="flex items-center gap-2">
                {DETAIL_MODES.map(m => (
                  <button key={m.value} onClick={() => setNewDetailSource(m.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      newDetailSource === m.value
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    }`}>
                    {isEn ? m.labelEn : m.labelTh}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleAddCat} disabled={isPending || !newValue || !newLabel || !newLabelTh}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-md disabled:opacity-50">
                <Save className="h-3 w-3" />{isPending ? '...' : (isEn ? 'Save' : 'บันทึก')}
              </button>
              <button onClick={() => setShowAddCat(false)} className="px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md">
                {isEn ? 'Cancel' : 'ยกเลิก'}
              </button>
            </div>
          </div>
        )}

        {/* Category Rows */}
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {categories.map(cat => {
            const items = categoryItems.filter(i => i.category_id === cat.id)
            const isCustom = cat.detail_source === 'custom'
            const isExpanded = expandedCatId === cat.id && isCustom
            const badge = getModeBadge(cat.detail_source)

            return (
              <div key={cat.id}>
                {/* Category Row */}
                <div className={`flex items-center gap-3 px-5 py-3 transition-colors ${!cat.is_active ? 'opacity-40' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30'} ${isCustom ? 'cursor-pointer' : ''}`}
                  onClick={() => isCustom && setExpandedCatId(isExpanded ? null : cat.id)}>

                  {editCatId === cat.id ? (
                    <div className="flex-1 space-y-2" onClick={e => e.stopPropagation()}>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={editLabel} onChange={e => setEditLabel(e.target.value)} className={inputCls} placeholder="Label EN" />
                        <input value={editLabelTh} onChange={e => setEditLabelTh(e.target.value)} className={inputCls} placeholder="Label TH" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {PRESET_COLORS.map(c => (
                          <button key={c} onClick={() => setEditColor(c)}
                            className={`h-5 w-5 rounded-full border-2 transition-all ${editColor === c ? 'border-zinc-900 dark:border-white scale-110' : 'border-transparent'}`}
                            style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium text-zinc-500 uppercase shrink-0">{isEn ? 'Detail:' : 'รายละเอียด:'}</span>
                        {DETAIL_MODES.map(m => (
                          <button key={m.value} onClick={() => setEditDetailSource(m.value)}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                              editDetailSource === m.value
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30'
                                : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:bg-zinc-50'
                            }`}>
                            {isEn ? m.labelEn : m.labelTh}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={handleSaveCat} disabled={isPending}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-md">
                          <Save className="h-3 w-3" />{isEn ? 'Save' : 'บันทึก'}
                        </button>
                        <button onClick={() => setEditCatId(null)} className="px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-100 rounded-md">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {isCustom && (
                        isExpanded
                          ? <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
                      )}
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{isEn ? cat.label : cat.label_th}</span>
                          <span className="text-[10px] font-mono text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{cat.value}</span>
                          {!cat.is_active && <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{isEn ? 'Hidden' : 'ซ่อน'}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-zinc-400">{isEn ? cat.label_th : cat.label}</span>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>
                            {badge.icon}{badge.text}
                          </span>
                          {isCustom && items.length > 0 && (
                            <span className="text-[10px] text-zinc-400">{items.length} {isEn ? 'items' : 'รายการ'}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleToggleCat(cat)} disabled={isPending}
                          className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                          {cat.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => handleEditCat(cat)} className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteCat(cat)} disabled={isPending}
                          className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Expanded: Items for "กำหนดเอง" categories */}
                {isExpanded && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30">
                    {items.map(item => (
                      <div key={item.id} className="flex items-center gap-3 px-9 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800/30 transition-colors">
                        {editItemId === item.id ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input value={editItemLabel} onChange={e => setEditItemLabel(e.target.value)}
                              className="flex-1 px-2 py-1 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 outline-none" />
                            <button onClick={handleSaveItem} disabled={isPending}
                              className="px-2 py-1 text-xs font-medium bg-amber-600 text-white rounded-md"><Save className="h-3 w-3" /></button>
                            <button onClick={() => setEditItemId(null)}
                              className="px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 rounded-md"><X className="h-3 w-3" /></button>
                          </div>
                        ) : (
                          <>
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">{item.label}</span>
                            <button onClick={() => handleEditItem(item)}
                              className="h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 dark:hover:bg-zinc-700">
                              <Edit3 className="h-3 w-3" />
                            </button>
                            <button onClick={() => handleDeleteItem(item)} disabled={isPending}
                              className="h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}

                    {/* Add Item Inline */}
                    {addingItemToCat === cat.id ? (
                      <div className="flex items-center gap-2 px-9 py-2.5">
                        <input value={newItemLabel} onChange={e => setNewItemLabel(e.target.value)}
                          placeholder={isEn ? 'New item...' : 'รายการใหม่...'}
                          className="flex-1 px-2 py-1 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 outline-none"
                          autoFocus onKeyDown={e => e.key === 'Enter' && handleAddItem(cat.id)} />
                        <button onClick={() => handleAddItem(cat.id)} disabled={isPending || !newItemLabel}
                          className="px-2.5 py-1 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-md disabled:opacity-50">
                          {isEn ? 'Add' : 'เพิ่ม'}
                        </button>
                        <button onClick={() => { setAddingItemToCat(null); setNewItemLabel('') }}
                          className="px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 rounded-md"><X className="h-3 w-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setAddingItemToCat(cat.id); setNewItemLabel('') }}
                        className="flex items-center gap-1.5 px-9 py-2.5 text-xs text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 w-full transition-colors">
                        <Plus className="h-3 w-3" />{isEn ? 'Add item' : 'เพิ่มรายการ'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ==================== SECTION 2: Staff (read-only) ==================== */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{isEn ? 'Staff Members' : 'รายชื่อพนักงาน'}</span>
            <span className="text-xs text-zinc-400">({staffProfiles.length})</span>
          </div>
          <span className="text-[10px] font-medium text-blue-600 bg-blue-50 dark:bg-blue-950/30 px-2 py-1 rounded">
            {isEn ? 'Auto from Users' : 'ดึงจาก User อัตโนมัติ'}
          </span>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {staffProfiles.map(s => (
            <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
              <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">
                {(s.full_name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{s.full_name || '—'}</span>
                {s.role && <span className="ml-2 text-[10px] font-medium text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{s.role}</span>}
              </div>
            </div>
          ))}
          {staffProfiles.length === 0 && <div className="px-5 py-8 text-center text-sm text-zinc-400">{isEn ? 'No users found' : 'ยังไม่มี user ในระบบ'}</div>}
        </div>
        <div className="px-5 py-3 bg-zinc-50 dark:bg-zinc-950/50 border-t border-zinc-200 dark:border-zinc-800">
          <p className="text-xs text-zinc-400">
            {isEn ? 'Staff list is automatically populated from registered users.' : 'รายชื่อพนักงานดึงจาก user ในระบบอัตโนมัติ จัดการได้ที่หน้าจัดการผู้ใช้'}
          </p>
        </div>
      </div>
    </div>
  )
}
