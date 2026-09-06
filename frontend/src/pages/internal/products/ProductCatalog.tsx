// Screen 16 (specs.md §6): every product, its variants and its pricing.
//
// Maintaining the catalogue is admin work (specs.md §2), but a rep picking a
// product for a quotation line needs to see the same rows — so the screen is
// read-only for everyone else rather than closed to them.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiError, CategoryView, ProductListItem } from '@dealflow360/shared';

import { InternalLayout } from '../../../components/layout/InternalLayout';
import {
  Badge,
  Button,
  Card,
  CardLabel,
  CardMetric,
  EmptyCard,
  ErrorCard,
  FilterChip,
  FilterChipGroup,
  LoadingCard,
  SearchInput,
  Table,
  TableShell,
  TableToolbar,
  Td,
  Th,
  Tr,
} from '../../../components/ui';
import { useAuth } from '../../../features/auth/useAuth';
import { fetchCategories, fetchProducts } from '../../../features/products/products.api';
import { humanise, money } from '../../../lib/format';
import { NewProductForm } from './NewProductForm';

export default function ProductCatalog() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [rows, setRows] = useState<ProductListItem[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [error, setError] = useState<ApiError | null>(null);

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    const response = await fetchProducts({
      search: search.trim() || undefined,
      categoryId: categoryId || undefined,
      includeInactive,
    });

    setRows(response.data ?? []);
    setTotal(response.meta?.total ?? null);
    setError(response.error);
  }, [search, categoryId, includeInactive]);

  useEffect(() => {
    // Typing filters the list, so the request waits for a pause in typing.
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    void fetchCategories().then((response) => setCategories(response.data ?? []));
  }, []);

  const counts = useMemo(() => {
    const list = rows ?? [];
    return {
      subscription: list.filter((row) => row.isSubscription).length,
      inactive: list.filter((row) => !row.isActive).length,
    };
  }, [rows]);

  const activeCategory = categories.find((category) => category.id === categoryId);

  return (
    <InternalLayout
      breadcrumb={['DealFlow360']}
      title="Products"
      actions={
        isAdmin ? (
          <Button onClick={() => setCreating((open) => !open)}>
            {creating ? 'Close' : 'New Product'}
          </Button>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      <div className="mb-lg grid gap-gutter md:grid-cols-3">
        <Card tone="obsidian">
          <CardLabel>Products listed</CardLabel>
          <CardMetric>{total ?? '—'}</CardMetric>
          <p className="text-body-sm text-obsidian-muted">
            {includeInactive ? 'including deactivated' : 'sellable today'}
          </p>
        </Card>
        <Card>
          <CardLabel>Subscription products</CardLabel>
          <CardMetric>{rows ? counts.subscription : '—'}</CardMetric>
          <p className="text-body-sm text-ink-subtle">billed on a recurring cycle</p>
        </Card>
        <Card tone={counts.inactive > 0 ? 'tangerine' : 'frost'}>
          <CardLabel>Deactivated</CardLabel>
          <CardMetric>{rows ? counts.inactive : '—'}</CardMetric>
          <p className="text-body-sm opacity-80">
            {includeInactive ? 'kept for existing quotes' : 'hidden from this list'}
          </p>
        </Card>
      </div>

      {creating && isAdmin && (
        <div className="mb-lg">
          <NewProductForm
            categories={categories}
            onCancel={() => setCreating(false)}
            onCreated={(product) => {
              setCreating(false);
              navigate(`/products/${product.id}`);
            }}
          />
        </div>
      )}

      <TableShell>
        <TableToolbar>
          <div>
            <h2 className="text-title-md text-ink">Catalogue</h2>
            <p className="text-body-sm text-ink-subtle">
              {isAdmin
                ? 'Open a product to edit it, manage its variants, or take it off the catalogue.'
                : 'Read only — your admin maintains these products.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-xs">
            <SearchInput
              placeholder="Search name or SKU"
              aria-label="Search products"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-[16rem] max-w-full"
            />
            <FilterChipGroup label="Category">
              <FilterChip active={categoryId === ''} onClick={() => setCategoryId('')}>
                All
              </FilterChip>
              {categories.map((category) => (
                <FilterChip
                  key={category.id}
                  active={categoryId === category.id}
                  onClick={() => setCategoryId(category.id)}
                >
                  {category.name}
                </FilterChip>
              ))}
            </FilterChipGroup>
            <FilterChip
              label="Status"
              active={includeInactive}
              onClick={() => setIncludeInactive((value) => !value)}
            >
              {includeInactive ? 'All' : 'Active'}
            </FilterChip>
          </div>
        </TableToolbar>

        {rows === null ? (
          <div className="p-lg">
            <LoadingCard label="Products" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-lg">
            <EmptyCard
              message={
                search || categoryId
                  ? `No products match ${search ? `"${search}"` : ''}${
                      search && activeCategory ? ' in ' : ''
                    }${activeCategory ? activeCategory.name : ''}.`
                  : 'No products in the catalogue yet.'
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Category</Th>
                <Th className="text-right">List price</Th>
                <Th className="text-right">Cost</Th>
                <Th>Type</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/products/${row.id}`)}
                >
                  <Td className="font-semibold text-ink">
                    <span className="block">{row.name}</span>
                    <span className="block text-label-md font-normal text-ink-subtle">
                      {row.sku}
                      {row.variants.length > 0
                        ? ` · ${row.variants.length} variant${row.variants.length > 1 ? 's' : ''}`
                        : ''}
                    </span>
                  </Td>
                  <Td>{row.category.name}</Td>
                  <Td numeric>{money(row.listPrice)}</Td>
                  <Td numeric>{money(row.unitCost)}</Td>
                  <Td>
                    {row.isSubscription ? (
                      <Badge variant="info">
                        {row.recurringCycle ? humanise(row.recurringCycle) : 'Subscription'}
                      </Badge>
                    ) : (
                      <Badge variant="neutral">One-time</Badge>
                    )}
                  </Td>
                  <Td>
                    {row.isActive ? (
                      <span className="text-body-sm text-ink-subtle">Active</span>
                    ) : (
                      <Badge variant="critical">Deactivated</Badge>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableShell>
    </InternalLayout>
  );
}
