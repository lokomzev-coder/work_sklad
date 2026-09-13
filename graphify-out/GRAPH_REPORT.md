# Graph Report - easy_work  (2026-09-13)

## Corpus Check
- Large corpus: 536 files · ~191,984 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 2803 nodes · 9687 edges · 167 communities (137 shown, 25 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.8)
- Token cost: 421,523 input · 0 output

## Community Hubs (Navigation)
- Legal Entities Actions
- Fulfillment & Packaging UI
- Data Table UI Components
- Excel/CSV Catalog Import
- Catalog Pricing & Contracts
- Discounts & Feature Catalog
- Sales Invoices (InvoiceOut)
- Card UI & Page Shells
- Fulfillment Drafts (Demand/Move/Supply)
- Sidebar Nav & Payments Subnav
- Catalog Item CRUD
- Label Template Constructor
- Dashboard Report Pages
- Catalog Groups
- Production Orders
- Subscription Billing Engine
- Platform Admin Inline Forms
- Employee Access & Memberships
- Document Detail Pages
- Client Contacts & Addresses
- Reports (ABC/Cost)
- Sidebar Shell & Layout
- Sales Channels & Permissions
- package.json Dependencies (A)
- package.json Dependencies (B)
- Print Menu & Org Switcher
- Retail Checkout (POS)
- Admin Panel Documentation
- Charts (Recharts)
- Catalog Bundles
- Cash Orders & Draft Documents
- Purchase Invoices (InvoiceIn)
- Platform Admin Pages
- Auth Login/Register
- Automation Scenarios
- Catalog Print Section
- Warehouse Movement Forms
- shadcn components.json Config
- Kassa POS Screen
- Project Notes Wiki (Home.md)
- Audit Log
- Command
- Vault
- Route
- Пароли (vault)
- Контрагенты
- Platform Admins
- Comments
- Invoice Payments
- Popover
- Tsconfig
- Attachments
- Custom Roles
- Profile
- Reports
- Permissions Matrix Editor
- Склад
- Area Trend Chart
- Api Registry
- Admin Auth
- Atol Provider
- Orders Subnav
- Atol Provider
- Каталог
- Document Statuses
- Projects
- Units
- Api Rate Limit
- Errors And Limits
- Breadcrumb
- Scenarios Manager
- Crypto
- Стек И Структура
- Layout
- Package
- Api Keys
- Employees
- Picking Waves
- Platform Roles
- Retail Shifts
- Stock Movements
- Tech Cards
- 05 Warehouse
- Groups
- Platform Feature Catalog
- Platform Subscriptions
- Webhooks
- Api Query
- Ai Artifacts
- 09 Settings And Automation
- Route
- Platform Subscription Plans
- Processing Stages
- 01 Getting Started
- 02 Catalog
- 03 Sales
- Proxy
- Exchange Rates
- Price Types
- Order Form
- 08 Finance And Reports
- Мультитенантность
- Custom Fields
- Document Status Transitions Manager
- Platform Admins Manager
- Next Auth.d
- Card Terminal
- 06 Retail
- 04 Purchasing
- Setnull Против Restrict
- Sales Channel Form
- Tech Process Form
- Audit Entity Labels
- Print Dialog
- Bundle Components Editor
- Expense Items
- .mcp
- Package
- Task List
- Vault Access Manager
- Print Production Document
- Readme
- Readme
- Package
- Page
- Admin Panel
- Reference
- Reference
- Atol Fiscalization
- Linux Server Hardening
- Deployment
- Linux Server Hardening
- Atol Fiscalization
- Readme
- Catalog Item Prices Editor
- Custom Entity Types Manager
- Discount Active Toggle
- Fulfillment Panel
- Admin Panel
- Readme
- Readme
- Deployment
- Linux Server Hardening
- Linux Server Hardening
- Eslint.config.mjs
- Postcss.config.mjs
- Inpas Smartsale Adapter
- Admin Panel
- Errors And Limits
- Readme
- Reference
- Reference
- Deployment
- Deployment
- Deployment
- Deployment
- Deployment
- Linux Server Hardening
- Linux Server Hardening
- Linux Server Hardening
- Route
- Route

## God Nodes (most connected - your core abstractions)
1. `getOrgContext()` - 476 edges
2. `assertPermission()` - 230 edges
3. `prisma` - 213 edges
4. `cn()` - 175 edges
5. `can()` - 166 edges
6. `Button()` - 144 edges
7. `react` - 134 edges
8. `Input()` - 82 edges
9. `Card()` - 81 edges
10. `CardContent()` - 81 edges

## Surprising Connections (you probably didn't know these)
- `Неизменяемость StockMovement/Order/PurchaseOrder` --semantically_similar_to--> `Черновик и проведение`  [INFERRED] [semantically similar]
  notes/Архитектура/Архивация вместо удаления.md → docs/user-guide/05-warehouse.md
- `main()` --calls--> `getAdminBasePath()`  [EXTRACTED]
  scripts/create-platform-owner.ts → src/lib/admin-path.ts
- `main()` --calls--> `encryptWithMasterKey()`  [EXTRACTED]
  scripts/create-platform-owner.ts → src/lib/crypto.ts
- `AI Artifacts Manifest` --references--> `CLAUDE.md entry point`  [EXTRACTED]
  AI_ARTIFACTS.md → CLAUDE.md
- `Приём оплаты картой через терминал` --semantically_similar_to--> `Розница (касса)`  [INFERRED] [semantically similar]
  docs/handbook/retail-integrations/card-terminal.md → docs/user-guide/06-retail.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Retail POS Checkout Flow (Terminal + Fiscalization)** — docs_handbook_retail_integrations_readme_checkout_sale, docs_handbook_retail_integrations_readme_payment_terminal_adapter, docs_handbook_retail_integrations_readme_register_fiscal_receipt, src_lib_fiscal_atol_provider [EXTRACTED 0.95]
- **Pluggable Provider Adapter Pattern** — docs_handbook_payment_provider_setup_credit_balance, src_lib_fiscal_atol_provider, docs_handbook_retail_integrations_readme_manual_confirmation_adapter [EXTRACTED 0.90]
- **Linux Server Defense-in-Depth Layers** — docs_handbook_linux_server_hardening_ssh, docs_handbook_linux_server_hardening_firewall, docs_handbook_linux_server_hardening_postgresql, docs_handbook_linux_server_hardening_backups, docs_handbook_linux_server_hardening_encryption_master_key [EXTRACTED 0.90]
- **FIFO Batch Costing Flow** — docs_user_guide_04_purchasing_goods_receipt, docs_user_guide_05_warehouse_fifo_costing, docs_user_guide_08_finance_and_reports_report_profit_loss [INFERRED 0.85]
- **Order Independent State Characteristics** — docs_user_guide_03_sales_order_status, docs_user_guide_03_sales_provedeno, docs_user_guide_03_sales_reserve, docs_user_guide_03_sales_payment_badge [EXTRACTED 1.00]
- **Multi-Tenant Isolation Mechanism** — notes_arhitektura_multitenantnost_getorgcontext, notes_arhitektura_multitenantnost_data_isolation, notes_arhitektura_multitenantnost_cross_org_injection [INFERRED 0.85]
- **Fulfillment (отгрузка/приёмка/возвраты) flow** — notes_domeny_zakazy_i_zakupki_fulfillmentpanel, notes_domeny_sklad_stockmovement, notes_domeny_zakazy_i_zakupki_order, notes_domeny_zakazy_i_zakupki_purchaseorder [INFERRED 0.85]
- **Discriminator-field pattern (type вместо отдельных таблиц)** — notes_resheniya_ledzher_vmesto_otdelnyh_dokumentov_discriminator_pattern, notes_domeny_katalog_catalogitem, notes_domeny_sklad_stockmovement [INFERRED 0.80]
- **Price-snapshot mechanism across documents** — notes_resheniya_praysing_snapshot_na_moment_dokumenta_decision, notes_domeny_zakazy_i_zakupki_order, notes_domeny_zakazy_i_zakupki_purchaseorder, notes_domeny_sklad_stockmovementline [INFERRED 0.85]

## Communities (167 total, 25 thin omitted)

### Community 0 - "Legal Entities Actions"
Cohesion: 0.05
Nodes (74): markAbandonedIfStale(), archiveLegalEntity(), clearOtherDefaults(), createLegalEntity(), deleteLegalEntity(), parseForm(), restoreLegalEntity(), updateLegalEntity() (+66 more)

### Community 1 - "Fulfillment & Packaging UI"
Cohesion: 0.06
Nodes (70): quickCreateClient(), ActionResult, ActionResult, ActionResult, BundleComponentsEditorProps, PackagingTypeComboboxProps, PackagingRow, PackagingsEditorProps (+62 more)

### Community 2 - "Data Table UI Components"
Cohesion: 0.09
Nodes (46): ACTION_LABEL, KIND_LABEL, TARGET_LABELS, STATUS_LABEL, ACTION_LABEL, INVOICE_STATUS_LABEL, TYPE_LABEL, CatalogSubnav() (+38 more)

### Community 3 - "Excel/CSV Catalog Import"
Cohesion: 0.05
Nodes (63): exceljs, papaparse, BatchResult, errorRow(), FIELD_LABELS, finalizeImportJob(), findExistingVariantId(), ImportRowInput (+55 more)

### Community 4 - "Catalog Pricing & Contracts"
Cohesion: 0.06
Nodes (41): ActionResult, setPriceSchema, deleteCharacteristic(), createContract(), deleteContract(), parseForm(), ActionResult, deleteCustomEntityType() (+33 more)

### Community 5 - "Discounts & Feature Catalog"
Cohesion: 0.08
Nodes (44): lucide-react, sonner, ActionResult, ActionResult, CreateDiscountInput, ActionResult, FeatureCatalogItemFormValues, OrganizationSubscriptionFormProps (+36 more)

### Community 6 - "Sales Invoices (InvoiceOut)"
Cohesion: 0.05
Nodes (54): upsertInvoiceIn(), createInvoiceOutFromOrderRecord(), lineItemSchema, nextInvoiceOutNumber(), updateInvoiceOutStatus(), upsertInvoiceOut(), UpsertInvoiceOutInput, UpsertInvoiceOutResult (+46 more)

### Community 7 - "Card UI & Page Shells"
Cohesion: 0.08
Nodes (38): ActionResult, ActionResult, ActionResult, initialState, initialState, initialState, CreateFeatureCatalogItemInline(), ComponentRow (+30 more)

### Community 8 - "Fulfillment Drafts (Demand/Move/Supply)"
Cohesion: 0.06
Nodes (50): CreateDraftDemandRecordResult, CreateDraftDemandResult, CreateDraftMoveResult, createDraftSupply(), CreateDraftSupplyResult, createPurchaseReturn(), createSalesReturn(), FulfillmentInput (+42 more)

### Community 9 - "Sidebar Nav & Payments Subnav"
Cohesion: 0.06
Nodes (43): class-variance-authority, OrgSidebarNav(), renderNavLink(), PaymentsSubnav(), PaymentsSubnavProps, TABS, AlertDialogMedia(), Avatar() (+35 more)

### Community 10 - "Catalog Item CRUD"
Cohesion: 0.07
Nodes (39): archiveCatalogItem(), assertRefsBelongToOrg(), createCatalogItem(), deleteCatalogItem(), parseCatalogItemForm(), restoreCatalogItem(), updateCatalogItem(), createCustomEntityValue() (+31 more)

### Community 11 - "Label Template Constructor"
Cohesion: 0.06
Nodes (35): jsbarcode, LabelTemplateActionResult, upsertLabelTemplate(), LabelTemplateEditor(), addElement(), handleAddBarcode(), handleAddField(), handleAddText() (+27 more)

### Community 12 - "Dashboard Report Pages"
Cohesion: 0.11
Nodes (30): InvoicesInPage(), InvoicesOutPage(), OrdersPage(), OrgDashboardPage(), CashOrdersPage(), PaymentsPage(), PurchaseOrdersPage(), AbcReportPage() (+22 more)

### Community 13 - "Catalog Groups"
Cohesion: 0.08
Nodes (35): generateBarcode(), assertParentBelongsToOrg(), createCatalogGroup(), deleteCatalogGroup(), isDescendant(), parseGroupForm(), updateCatalogGroup(), ActionResult (+27 more)

### Community 14 - "Production Orders"
Cohesion: 0.09
Nodes (36): ActionResult, completeProductionOrder(), CompleteProductionOrderResult, completeProductionStage(), CompleteProductionStageResult, nextMovementNumber(), nextProductionOrderNumber(), upsertProductionOrder() (+28 more)

### Community 15 - "Subscription Billing Engine"
Cohesion: 0.09
Nodes (32): purchaseSubscriptionAction(), SubscriptionActionResult, dynamic, GET(), dynamic, GET(), AddOnFeaturesSection(), handleBuy() (+24 more)

### Community 16 - "Platform Admin Inline Forms"
Cohesion: 0.12
Nodes (20): react, ActionResult, CreateSubscriptionPlanInline(), CAPABILITY_LABELS, PlatformRoleFormProps, PlanFeatureOption, SubscriptionPlanFormValues, PrintPriceListButton() (+12 more)

### Community 17 - "Employee Access & Memberships"
Cohesion: 0.11
Nodes (30): ActionResult, grantEmployeeAccess(), grantSchema, revokeEmployeeAccess(), switchToIndividualRole(), updateEmployeeAccess(), updateSchema, ArchiveRowActionsProps (+22 more)

### Community 18 - "Document Detail Pages"
Cohesion: 0.20
Nodes (24): EditCatalogItemPage(), InvoiceInDetailPage(), NewInvoiceInPage(), InvoiceOutDetailPage(), NewInvoiceOutPage(), EditOrderPage(), lineKey(), NewOrderPage() (+16 more)

### Community 19 - "Client Contacts & Addresses"
Cohesion: 0.08
Nodes (28): ActionResult, createClientAddress(), deleteClientAddress(), createClientContact(), deleteClientContact(), archiveClient(), createClient(), deleteClient() (+20 more)

### Community 20 - "Reports (ABC/Cost)"
Cohesion: 0.07
Nodes (30): getLastPurchaseUnitCosts(), MaterialCostLookup, AbcClass, AbcReport, AbcRow, classifyAbc(), ClientSalesRow, DailyPoint (+22 more)

### Community 21 - "Sidebar Shell & Layout"
Cohesion: 0.09
Nodes (25): OrgLayout(), NavItem, collapsedListeners, GatedNavItem, getCollapsedServerSnapshot(), getCollapsedSnapshot(), MobileSidebarContext, MobileSidebarTrigger() (+17 more)

### Community 22 - "Sales Channels & Permissions"
Cohesion: 0.10
Nodes (24): createSalesChannel(), deleteSalesChannel(), parseForm(), dynamic, ENTITY_TYPE_TO_RESOURCE, GET(), EmployeePermissionsPage(), RoleDetailPage() (+16 more)

### Community 23 - "package.json Dependencies (A)"
Cohesion: 0.06
Nodes (30): name, private, type, version, @base-ui/react, clsx, cmdk, dotenv (+22 more)

### Community 24 - "package.json Dependencies (B)"
Cohesion: 0.06
Nodes (31): dependencies, @base-ui/react, bcryptjs, class-variance-authority, clsx, cmdk, dotenv, exceljs (+23 more)

### Community 25 - "Print Menu & Org Switcher"
Cohesion: 0.09
Nodes (22): deleteLabelTemplate(), CatalogLabelPrintDialog(), CatalogPrintMenu(), CatalogPrintMenuProps, OrgSwitcher(), OrgSwitcherProps, DialogContent(), DialogDescription() (+14 more)

### Community 26 - "Retail Checkout (POS)"
Cohesion: 0.10
Nodes (22): CheckoutInput, CheckoutResult, checkoutReturn(), CheckoutReturnInput, checkoutSale(), checkoutSchema, CreateRetailSaleFromOrderResult, getTerminalAdapter() (+14 more)

### Community 27 - "Admin Panel Documentation"
Cohesion: 0.07
Nodes (27): Add-on feature purchase (ADD_ON), Platform audit log (/admin/audit-log), creditBalance() manual top-up, Feature catalog constructor (custom tariff), Enforced feature keys (retail/production/custom_roles), /admin/organizations card, resolveSubscriptionState(), Admin roles & capabilities (+19 more)

### Community 28 - "Charts (Recharts)"
Cohesion: 0.13
Nodes (22): recharts, StatusDonutChart(), StatusDonutChartProps, config, StatusFunnelChart(), StatusFunnelChartProps, config, StockActivityChart() (+14 more)

### Community 29 - "Catalog Bundles"
Cohesion: 0.07
Nodes (19): zod, componentSchema, UpdateBundleComponentsInput, UpdateBundleComponentsResult, updateComponentsSchema, CatalogGroupInput, catalogGroupSchema, CharacteristicInput (+11 more)

### Community 30 - "Cash Orders & Draft Documents"
Cohesion: 0.12
Nodes (24): createCashOrder(), createCashOrderFromOrder(), CreateCashOrderFromOrderResult, deleteCashOrder(), createDraftDemand(), createDraftMoveFromOrder(), createInvoiceFromOrder(), createDraftPurchaseOrderFromOrder() (+16 more)

### Community 31 - "Purchase Invoices (InvoiceIn)"
Cohesion: 0.12
Nodes (24): createInvoiceFromPurchaseOrder(), createInvoiceInFromPurchaseOrderRecord(), lineItemSchema, nextInvoiceInNumber(), updateInvoiceInStatus(), UpsertInvoiceInInput, UpsertInvoiceInResult, upsertInvoiceInSchema (+16 more)

### Community 32 - "Platform Admin Pages"
Cohesion: 0.21
Nodes (19): PlatformAdminsPage(), PlatformAuditLogPage(), FeatureCatalogItemEditPage(), FeatureCatalogPage(), AdminProtectedLayout(), PlatformOrganizationDetailPage(), PlatformOrganizationsPage(), AdminHomePage() (+11 more)

### Community 33 - "Auth Login/Register"
Cohesion: 0.14
Nodes (19): loginAction(), logoutAction(), registerAction(), uniqueSlug(), LoginPage(), RegisterPage(), FloorLayout(), KassaLayout() (+11 more)

### Community 34 - "Automation Scenarios"
Cohesion: 0.10
Nodes (16): ActionResult, actionSchema, conditionSchema, createScenarioRule(), CreateScenarioRuleInput, createScenarioRuleSchema, deleteScenarioRule(), toggleScenarioRuleActive() (+8 more)

### Community 35 - "Catalog Print Section"
Cohesion: 0.18
Nodes (11): CatalogPrintSection(), CatalogPrintSectionProps, CatalogRow, TYPE_LABEL, ArchivableColumn, ArchivableEntityTable(), ArchivableEntityTableProps, EntityStatusFilter (+3 more)

### Community 36 - "Warehouse Movement Forms"
Cohesion: 0.11
Nodes (18): ActionResult, ActionResult, ActionResult, CashOrderFormProps, DIRECTION_ITEMS, initialState, DIRECTION_ITEMS, initialState (+10 more)

### Community 37 - "shadcn components.json Config"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 38 - "Kassa POS Screen"
Cohesion: 0.12
Nodes (15): ActionResult, ActionResult, CharacteristicFormProps, initialState, QuerySearchInput(), QuerySearchInputProps, CartRow, CatalogOption (+7 more)

### Community 39 - "Project Notes Wiki (Home.md)"
Cohesion: 0.13
Nodes (21): Черновик и проведение, Архивация вместо удаления, status: ARCHIVED, archiveOrDelete, checkReferences, Неизменяемость StockMovement/Order/PurchaseOrder, Справочники без архивации (Unit, CatalogGroup, Characteristic, SalesChannel, Contract), Order.clientId SetNull баг (+13 more)

### Community 40 - "Audit Log"
Cohesion: 0.14
Nodes (14): ApiErrorOptions, CollectionMeta, collectionResponse(), serialize(), AuditActor, getCurrentAuditActor(), globalForAudit, AUDITED_MODELS (+6 more)

### Community 41 - "Command"
Cohesion: 0.15
Nodes (16): searchOrg(), SearchResultItem, SearchResults, CommandPalette(), CommandPaletteProps, EMPTY_RESULTS, GROUPS, Command() (+8 more)

### Community 42 - "Vault"
Cohesion: 0.18
Nodes (17): archiveVaultEntry(), createVaultEntry(), parseVaultEntryForm(), restoreVaultEntry(), RevealSecretResult, revealVaultSecret(), updateVaultEntry(), RevealSecretButton() (+9 more)

### Community 43 - "Route"
Cohesion: 0.37
Nodes (18): DELETE(), dynamic, findOwned(), GET(), PUT(), dynamic, GET(), POST() (+10 more)

### Community 44 - "Пароли (vault)"
Cohesion: 0.13
Nodes (19): Ролевая модель, Access Enum (none/read/edit/full), ADMIN Role, assertPermission(), Двойная проверка прав, EMPLOYEE Role, MANAGER Role, Permission Resources (vault/employees/clients/catalog/orders/membership/warehouse) (+11 more)

### Community 45 - "Контрагенты"
Cohesion: 0.17
Nodes (19): Контрагенты, Client (покупатель и поставщик в одной модели), ClientContact, Несколько юрлиц компании (D1, не реализовано), SalesChannel, Отчёты, Отчёт «Деньги» (/reports/money), Отчёт «Продажи по клиентам» (+11 more)

### Community 46 - "Platform Admins"
Cohesion: 0.15
Nodes (14): bcryptjs, otpauth, qrcode, ask(), askHidden(), main(), confirmPlatformAdminSetup(), PlatformActionResult (+6 more)

### Community 47 - "Comments"
Cohesion: 0.17
Nodes (16): ActionResult, createComment(), deleteComment(), ENTITY_TYPE_TO_RESOURCE, resourceFor(), MovementDetailPage(), TYPE_LABEL, CommentRow (+8 more)

### Community 48 - "Invoice Payments"
Cohesion: 0.23
Nodes (14): createDraftDemandRecord(), amountSchema, recordInvoiceInPayment(), recordInvoiceOutPayment(), RecordInvoicePaymentResult, createPayment(), createPaymentFromOrder(), CreatePaymentFromOrderResult (+6 more)

### Community 49 - "Popover"
Cohesion: 0.18
Nodes (16): getMyRecentNotifications(), getMyUnreadNotificationCount(), markAllNotificationsRead(), markNotificationRead(), NotificationRow, DOCUMENT_PATH, NotificationBell(), handleMarkAllRead() (+8 more)

### Community 50 - "Tsconfig"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 51 - "Attachments"
Cohesion: 0.20
Nodes (15): ActionResult, deleteAttachment(), ENTITY_TYPE_TO_RESOURCE, resourceFor(), uploadAttachment(), AttachmentList(), handleDelete(), handleFileChange() (+7 more)

### Community 52 - "Custom Roles"
Cohesion: 0.14
Nodes (17): ActionResult, clampToCeiling(), createCustomRole(), createSchema, deleteCustomRole(), promoteIndividualRole(), renameCustomRole(), resourcePermissionSchema (+9 more)

### Community 53 - "Profile"
Cohesion: 0.24
Nodes (13): changeOwnPassword(), requireUserId(), updateOwnDefaults(), updateOwnProfile(), ProfilePage(), FloorProfilePage(), KassaProfilePage(), ChangePasswordForm() (+5 more)

### Community 54 - "Reports"
Cohesion: 0.25
Nodes (17): TurnoverReportPage(), ClientBalance, getClientBalance(), getLatestRates(), toBase(), dateFilter(), dayKey(), eachDay() (+9 more)

### Community 55 - "Permissions Matrix Editor"
Cohesion: 0.14
Nodes (14): SidebarContentProps, SidebarShellProps, FullResourceMap, PermissionsMatrixEditor(), PermissionsMatrixEditorProps, SCOPE_LABELS, SCOPE_RANK, PERMISSION_GROUPS (+6 more)

### Community 56 - "Склад"
Cohesion: 0.18
Nodes (17): Только PRODUCT участвует в складском леджере, У варианта нет собственного остатка, Отчёт P&L (/reports/pnl, упрощённый), Отчёт «Обороты» (/reports/turnover), Склад, lib/stock.ts::getStockBalances, Движения неизменяемы (корректирующее движение вместо правки истории), 8 типов StockMovement (ENTER/LOSS/MOVE/INVENTORY/DEMAND/SUPPLY/SALES_RETURN/PURCHASE_RETURN) (+9 more)

### Community 57 - "Area Trend Chart"
Cohesion: 0.22
Nodes (13): ReportsOverviewPage(), TOP_N_OPTIONS, AreaTrendChart(), AreaTrendChartProps, AreaTrendSeries, RankedBarList(), RankedBarListProps, CURRENCY_ICONS (+5 more)

### Community 58 - "Api Registry"
Cohesion: 0.13
Nodes (7): ENTITY_REGISTRY, getEntityConfig(), PrismaDelegate, DiscountInput, discountSchema, PriceTypeInput, priceTypeSchema

### Community 59 - "Admin Auth"
Cohesion: 0.17
Nodes (12): AdminActionResult, adminLoginAction(), adminLoginSchema, AdminLoginPage(), AdminRateLimited, getClientIp(), {
  handlers: adminHandlers,
  auth: adminAuth,
  signIn: adminSignIn,
  signOut: adminSignOut,
}, InvalidAdminCredentials (+4 more)

### Community 60 - "Atol Provider"
Cohesion: 0.23
Nodes (8): dynamic, GET(), AtolOnlineProvider, AtolReceiptInput, FiscalPollResult, FiscalReceiptRequest, pollPendingFiscalReceipts(), registerFiscalReceipt()

### Community 61 - "Orders Subnav"
Cohesion: 0.21
Nodes (10): OrgSidebarNavProps, ThemeToggle(), OrdersSubnav(), OrdersSubnavProps, TABS, Tooltip(), TooltipContent(), TooltipTrigger() (+2 more)

### Community 62 - "Atol Provider"
Cohesion: 0.13
Nodes (13): Pre-launch deployment checklist, 54-FZ fiscalization requirement / OFD, Fiscalization fully optional per org (never blocks sale), Retail integrations overview (fiscalization + terminal), AtolReceiptItem, AtolReportResponse, AtolSellResponse, AtolTokenResponse (+5 more)

### Community 63 - "Каталог"
Cohesion: 0.23
Nodes (15): Каталог, Запрет вложенных комплектов на уровне action, CatalogGroup (self-relation дерево), CatalogItem (discriminator type: PRODUCT|SERVICE|BUNDLE), CatalogItemComponent (Bundle join table), CatalogItemVariant, Characteristic, Unit (+7 more)

### Community 64 - "Document Statuses"
Cohesion: 0.22
Nodes (14): ActionResult, createDocumentStatus(), createSchema, deleteDocumentStatus(), DeleteStatusResult, moveDocumentStatus(), renameDocumentStatus(), toggleFinalStatus() (+6 more)

### Community 65 - "Projects"
Cohesion: 0.17
Nodes (14): ActionResult, archiveProject(), quickCreateProject(), QuickCreateProjectResult, restoreProject(), upsertProject(), UpsertProjectInput, UpsertProjectResult (+6 more)

### Community 66 - "Units"
Cohesion: 0.19
Nodes (10): ActionResult, createUnit(), deleteUnit(), parseUnitForm(), updateUnit(), EditUnitPage(), UnitForm(), UnitFormProps (+2 more)

### Community 67 - "Api Rate Limit"
Cohesion: 0.27
Nodes (11): dynamic, GET(), ApiAuthContext, resolveApiAuth(), ApiGuardFail, ApiGuardOk, hashApiKey(), checkRateLimit() (+3 more)

### Community 68 - "Errors And Limits"
Cohesion: 0.16
Nodes (14): Documents read-only summary (entities.md), Entity type registry (api-registry.ts), Error JSON format & HTTP codes, ?expand= relation expansion, ?filter= syntax (narrower than MoySklad), api-rate-limit.ts sliding window, ?search= case-insensitive contains, API-key auth (org-scoped, ADMIN-equivalent) (+6 more)

### Community 69 - "Breadcrumb"
Cohesion: 0.23
Nodes (11): labelFor(), PageBreadcrumb(), PageBreadcrumbProps, Breadcrumb(), BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink(), BreadcrumbList() (+3 more)

### Community 70 - "Scenarios Manager"
Cohesion: 0.14
Nodes (13): ActionRow, ConditionRow, DOCUMENT_TYPE_LABELS, Entity, EVENT_TYPE_LABELS, FIELD_LABELS, ID_OPERATORS, NUMERIC_FIELDS (+5 more)

### Community 71 - "Crypto"
Cohesion: 0.29
Nodes (12): decryptWithKey(), EncryptedSecret, encryptWithKey(), encryptWithMasterKey(), generateDek(), getMasterKey(), RawEncrypted, RawEncryptedInput (+4 more)

### Community 72 - "Стек И Структура"
Cohesion: 0.19
Nodes (12): AGENTS.md, Стек и структура, Base UI (не Radix), Select.Value не сопоставляет value→label, Button nativeButton={false} при render, Слои приложения (app/actions/components/lib/schema), Next.js 16 (App Router, Turbopack), Prisma 7 (+4 more)

### Community 73 - "Layout"
Cohesion: 0.18
Nodes (9): nextConfig, next, next-themes, geistMono, inter, interTight, metadata, Toaster() (+1 more)

### Community 74 - "Package"
Cohesion: 0.15
Nodes (13): devDependencies, eslint, eslint-config-next, prisma, tailwindcss, @tailwindcss/postcss, tsx, @types/node (+5 more)

### Community 75 - "Api Keys"
Cohesion: 0.26
Nodes (10): ActionResult, createApiKey(), CreateApiKeyResult, createSchema, revokeApiKey(), ApiKeysManager(), handleCreate(), handleRevoke() (+2 more)

### Community 76 - "Employees"
Cohesion: 0.26
Nodes (11): archiveEmployee(), createEmployee(), isValidGroupId(), isValidStoreId(), newAccessSchema, parseEmployeeForm(), restoreEmployee(), updateEmployee() (+3 more)

### Community 77 - "Picking Waves"
Cohesion: 0.22
Nodes (10): createDraftDemandsForWave(), CreateDraftDemandsForWaveResult, createPickingWave(), CreatePickingWaveResult, nextPickingWaveNumber(), OrdersSelectableTable(), handleCreateWave(), CreateWaveDemandsButton() (+2 more)

### Community 78 - "Platform Roles"
Cohesion: 0.24
Nodes (11): createPlatformRole(), deletePlatformRole(), permissionsSchema, PlatformActionResult, sanitizePermissions(), updatePlatformRole(), DeletePlatformRoleButton(), handleClick() (+3 more)

### Community 79 - "Retail Shifts"
Cohesion: 0.24
Nodes (12): ActionResult, closeShift(), CloseShiftResult, computeExpectedCash(), openShift(), recordCashTransaction(), requireStoreId(), OpenShiftForm() (+4 more)

### Community 80 - "Stock Movements"
Cohesion: 0.18
Nodes (10): createMovementSchema, createStockMovement(), CreateStockMovementInput, CreateStockMovementResult, lineSchema, nextMovementNumber(), lineKey(), MovementForm() (+2 more)

### Community 81 - "Tech Cards"
Cohesion: 0.17
Nodes (10): archiveTechCard(), componentSchema, restoreTechCard(), upsertTechCard(), UpsertTechCardInput, UpsertTechCardResult, upsertTechCardSchema, newRow() (+2 more)

### Community 82 - "05 Warehouse"
Cohesion: 0.23
Nodes (12): Приёмка товара, Склад, Партионный учёт себестоимости (FIFO), Приёмка (движение), Расход в производство (движение), Выпуск продукции (движение), Склад (сущность), Производство (+4 more)

### Community 83 - "Groups"
Cohesion: 0.26
Nodes (11): ActionResult, archiveGroup(), createGroup(), groupSchema, restoreGroup(), NewGroupDialog(), handleCreate(), GroupsManager() (+3 more)

### Community 84 - "Platform Feature Catalog"
Cohesion: 0.26
Nodes (9): catalogItemSchema, PlatformActionResult, setFeatureCatalogItemStatus(), upsertFeatureCatalogItem(), UpsertFeatureCatalogItemInput, ArchiveFeatureCatalogItemButton(), handleClick(), FeatureCatalogItemForm() (+1 more)

### Community 85 - "Platform Subscriptions"
Cohesion: 0.23
Nodes (10): creditOrganizationBalance(), PlatformActionResult, setOrganizationSubscription(), ACTION_LABEL, INVOICE_STATUS_LABEL, CreditBalanceForm(), handleSubmit(), OrganizationSubscriptionForm() (+2 more)

### Community 86 - "Webhooks"
Cohesion: 0.27
Nodes (11): ActionResult, createSchema, createWebhook(), deleteWebhook(), retryWebhookDeliveryNow(), toggleWebhookActive(), WebhooksManager(), handleCreate() (+3 more)

### Community 87 - "Api Query"
Cohesion: 0.26
Nodes (11): coerceValue(), ExpandResult, FILTER_OPERATORS, ParsedListQuery, parseExpand(), parseExpandOnly(), parseFilter(), parseListQuery() (+3 more)

### Community 88 - "Ai Artifacts"
Cohesion: 0.22
Nodes (11): generate-agent-files.js, Non-standard Next.js version warning, node_modules/next/dist/docs, .agents/ skill content, .claude/ directory, .claude-flow/ orchestrator state, AI Artifacts Manifest, ROADMAP.md (decision-needed item) (+3 more)

### Community 89 - "09 Settings And Automation"
Cohesion: 0.22
Nodes (11): API документация (handbook), Настройки и автоматизация, API-ключи, Сценарии-автоматизации, Кассовые ордера, Журнал изменений, Справочники, Доп. поля (+3 more)

### Community 90 - "Route"
Cohesion: 0.29
Nodes (8): playwright, dynamic, GET(), resolveSafePrintUrl(), suggestFilename(), getInternalAppOrigin(), getPdfBrowser(), globalForPdfBrowser

### Community 91 - "Platform Subscription Plans"
Cohesion: 0.22
Nodes (9): deleteSubscriptionPlan(), planSchema, PlatformActionResult, upsertSubscriptionPlan(), UpsertSubscriptionPlanInput, DeleteSubscriptionPlanButton(), handleClick(), SubscriptionPlanForm() (+1 more)

### Community 92 - "Processing Stages"
Cohesion: 0.20
Nodes (8): archiveProcessingStage(), restoreProcessingStage(), upsertProcessingStage(), UpsertProcessingStageInput, UpsertProcessingStageResult, upsertProcessingStageSchema, ProcessingStageForm(), handleSubmit()

### Community 93 - "01 Getting Started"
Cohesion: 0.22
Nodes (10): Первые шаги, Юрлицо, Организация, ADMIN, EMPLOYEE, MANAGER, PRODUCTION, /floor интерфейс (+2 more)

### Community 94 - "02 Catalog"
Cohesion: 0.27
Nodes (10): Каталог, Скидки, Комплект (тип позиции), Минимальный остаток, Модификации (характеристики), Прайс-лист, Типы цен, Товар (тип позиции) (+2 more)

### Community 95 - "03 Sales"
Cohesion: 0.27
Nodes (10): Продажи, Создать документ, Счёт покупателю, Статус заказа, Оплата (бейдж), Проведено, Резерв, Отгрузка (движение) (+2 more)

### Community 96 - "Proxy"
Cohesion: 0.20
Nodes (5): next-auth, { handlers, auth, signIn, signOut }, config, proxy, PUBLIC_PATHS

### Community 97 - "Exchange Rates"
Cohesion: 0.31
Nodes (9): ActionResult, createExchangeRate(), deleteExchangeRate(), rateSchema, setBaseCurrency(), ExchangeRatesManager(), handleAddRate(), handleDelete() (+1 more)

### Community 98 - "Price Types"
Cohesion: 0.28
Nodes (6): ActionResult, createPriceType(), deletePriceType(), parseForm(), PriceTypeForm(), PriceTypeFormProps

### Community 99 - "Order Form"
Cohesion: 0.28
Nodes (4): newRow(), OrderForm(), addItemRow(), handleBarcodeKeyDown()

### Community 100 - "08 Finance And Reports"
Cohesion: 0.29
Nodes (8): Заказ покупателя, Финансы и отчёты, Взаиморасчёты на карточке клиента, Договоры, Проекты, Отчёт: Обзор, Отчёт: Продажи по клиентам, Корректировки баланса

### Community 101 - "Мультитенантность"
Cohesion: 0.39
Nodes (8): Мультитенантность, Кросс-организационная инъекция, Изоляция данных по orgId, getOrgContext, /[org]/... маршрутизация, OrgSwitcher, session.memberships[], Пароли (vault)

### Community 102 - "Custom Fields"
Cohesion: 0.36
Nodes (7): ActionResult, createCustomFieldDefinition(), createSchema, deleteCustomFieldDefinition(), CustomFieldDefinitionsManager(), handleCreate(), handleDelete()

### Community 103 - "Document Status Transitions Manager"
Cohesion: 0.32
Nodes (5): createStatusTransition(), deleteStatusTransition(), DocumentStatusTransitionsManager(), handleCreate(), handleDelete()

### Community 104 - "Platform Admins Manager"
Cohesion: 0.36
Nodes (7): invitePlatformAdmin(), setPlatformAdminStatus(), updatePlatformAdminRole(), PlatformAdminsManager(), handleInvite(), handleRoleChange(), handleStatusToggle()

### Community 105 - "Next Auth.d"
Cohesion: 0.25
Nodes (7): @auth/core/jwt, JWT, next-auth, next-auth/jwt, OrgMembership, Session, User

### Community 106 - "Card Terminal"
Cohesion: 0.62
Nodes (7): Приём оплаты картой через терминал, Служба-мост (bridge service), checkoutSale, INPAS SmartSale / DualConnector, InpasSmartSaleAdapter, ManualConfirmationAdapter, PaymentTerminalAdapter

### Community 107 - "06 Retail"
Cohesion: 0.29
Nodes (7): CASHIER, Розничная продажа (движение), Розница (касса), Фискальный чек, /kassa интерфейс, Возврат (розница), Кассовая смена

### Community 108 - "04 Purchasing"
Cohesion: 0.29
Nodes (7): Платежи, Снабжение, Заказ поставщику, Счета поставщиков, Возврат поставщику, Возврат поставщику (движение), Руководство пользователя WorkSklad

### Community 109 - "Setnull Против Restrict"
Cohesion: 0.43
Nodes (7): Contract, Contract onDelete: SetNull + проверка в deleteContract, Order.contractId связь, SetNull против Restrict, Решение: SetNull vs Restrict для опциональных FK, Баг: Order.clientId молча обнулялся при удалении клиента, Баг: Order/PurchaseOrder.contractId — тот же класс при удалении Contract

### Community 110 - "Sales Channel Form"
Cohesion: 0.38
Nodes (4): ActionResult, initialState, SalesChannelForm(), SalesChannelFormProps

### Community 111 - "Tech Process Form"
Cohesion: 0.33
Nodes (4): upsertTechProcess(), newRow(), TechProcessForm(), handleSubmit()

### Community 112 - "Audit Entity Labels"
Cohesion: 0.43
Nodes (4): QuerySelectFilter(), AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, AUDIT_SOURCE_LABELS

### Community 113 - "Print Dialog"
Cohesion: 0.29
Nodes (6): DocumentType, LABEL_MODE_ITEMS, LABEL_TYPES, LEGAL_ENTITY_TYPES, PRINT_PATH, PrintDialogProps

### Community 114 - "Bundle Components Editor"
Cohesion: 0.40
Nodes (4): updateBundleComponents(), BundleComponentsEditor(), handleSave(), newRow()

### Community 115 - "Expense Items"
Cohesion: 0.40
Nodes (5): ActionResult, createExpenseItem(), deleteExpenseItem(), ExpenseItemsManager(), handleCreate()

### Community 116 - ".mcp"
Cohesion: 0.60
Nodes (4): npx, playwright-phone, playwright-tablet, @playwright/mcp

### Community 117 - "Package"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, start

### Community 118 - "Task List"
Cohesion: 0.50
Nodes (5): setTaskStatus(), formatDate(), isOverdue(), TaskList(), toggle()

### Community 119 - "Vault Access Manager"
Cohesion: 0.60
Nodes (5): grantVaultAccess(), revokeVaultAccess(), VaultAccessManager(), handleGrant(), handleRevoke()

### Community 120 - "Print Production Document"
Cohesion: 0.40
Nodes (3): PrintLine, PrintProductionDocument(), PrintProductionDocumentProps

### Community 121 - "Readme"
Cohesion: 0.50
Nodes (4): auditLog type summary (entities.md), AsyncLocalStorage audit-context limitation, GET /api/v1/entity/auditLog, auditLog entity fields

### Community 122 - "Readme"
Cohesion: 0.50
Nodes (4): cashOrder entity (README), counterpartyAdjustment entity (README), cashOrder entity fields (reference), counterpartyAdjustment entity fields (reference)

### Community 123 - "Package"
Cohesion: 0.50
Nodes (4): allowScripts, prisma@7.9.1, @prisma/engines@7.9.1, unrs-resolver@1.12.2

### Community 125 - "Admin Panel"
Cohesion: 0.67
Nodes (3): admin-session-token cookie, PlatformAdmin table, Mandatory TOTP 2FA

### Community 126 - "Reference"
Cohesion: 0.67
Nodes (3): priceType/discount do not affect actual price, discount entity fields (polymorphic target), priceType entity fields

### Community 127 - "Reference"
Cohesion: 0.67
Nodes (3): catalogItem entity fields (unitPrice/taxRate), catalogItemVariant (read-only), CatalogItem.taxRate VAT field (Block O phase 2)

### Community 128 - "Atol Fiscalization"
Cohesion: 0.67
Nodes (3): External cron: webhook-retries & fiscal-status, pollPendingFiscalReceipts() via cron, FiscalReceipt status lifecycle (PENDING/REGISTERED/FAILED)

### Community 129 - "Linux Server Hardening"
Cohesion: 0.67
Nodes (3): ENCRYPTION_MASTER_KEY, ENCRYPTION_MASTER_KEY rotation procedure, .env chmod 600

### Community 130 - "Deployment"
Cohesion: 1.00
Nodes (3): Kassa on separate subdomain (proxy routing), Reverse proxy + TLS (nginx/Caddy), certbot TLS setup

### Community 131 - "Linux Server Hardening"
Cohesion: 0.67
Nodes (3): Process manager (systemd/PM2), Dedicated unprivileged app user, worksklad.service systemd unit

### Community 132 - "Atol Fiscalization"
Cohesion: 0.67
Nodes (3): Platform secret storage (master-key, not org-DEK), ATOL login/password encrypted via crypto.ts/org-dek.ts, setFiscalConfig() one-off script

### Community 133 - "Readme"
Cohesion: 0.67
Nodes (3): Geist font via next/font, create-next-app bootstrap, Deploy on Vercel Platform

### Community 134 - "Catalog Item Prices Editor"
Cohesion: 1.00
Nodes (3): setCatalogItemPrice(), CatalogItemPricesEditor(), handleBlur()

### Community 135 - "Custom Entity Types Manager"
Cohesion: 1.00
Nodes (3): createCustomEntityType(), CustomEntityTypesManager(), handleCreate()

### Community 136 - "Discount Active Toggle"
Cohesion: 1.00
Nodes (3): toggleDiscountActive(), DiscountActiveToggle(), handleChange()

### Community 137 - "Fulfillment Panel"
Cohesion: 1.00
Nodes (3): FulfillmentPanel(), handleSubmit(), lineKey()

## Knowledge Gaps
- **739 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+734 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 871 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getOrgContext()` connect `Legal Entities Actions` to `Fulfillment & Packaging UI`, `Data Table UI Components`, `Excel/CSV Catalog Import`, `Catalog Pricing & Contracts`, `Catalog Item Prices Editor`, `Custom Entity Types Manager`, `Discount Active Toggle`, `Fulfillment Drafts (Demand/Move/Supply)`, `Catalog Item CRUD`, `Sales Invoices (InvoiceOut)`, `Label Template Constructor`, `Catalog Groups`, `Production Orders`, `Subscription Billing Engine`, `Card UI & Page Shells`, `Employee Access & Memberships`, `Document Detail Pages`, `Client Contacts & Addresses`, `Dashboard Report Pages`, `Sidebar Shell & Layout`, `Sales Channels & Permissions`, `Print Menu & Org Switcher`, `Retail Checkout (POS)`, `Catalog Bundles`, `Cash Orders & Draft Documents`, `Purchase Invoices (InvoiceIn)`, `Auth Login/Register`, `Automation Scenarios`, `Catalog Print Section`, `Command`, `Vault`, `Route`, `Comments`, `Invoice Payments`, `Popover`, `Attachments`, `Custom Roles`, `Profile`, `Reports`, `Area Trend Chart`, `Document Statuses`, `Projects`, `Units`, `Api Keys`, `Employees`, `Picking Waves`, `Retail Shifts`, `Stock Movements`, `Tech Cards`, `Groups`, `Webhooks`, `Processing Stages`, `Exchange Rates`, `Price Types`, `Custom Fields`, `Document Status Transitions Manager`, `Tech Process Form`, `Audit Entity Labels`, `Bundle Components Editor`, `Expense Items`, `Task List`, `Vault Access Manager`, `Page`?**
  _High betweenness centrality (0.163) - this node is a cross-community bridge._
- **Why does `prisma` connect `Catalog Pricing & Contracts` to `Legal Entities Actions`, `Data Table UI Components`, `Excel/CSV Catalog Import`, `Sales Invoices (InvoiceOut)`, `Card UI & Page Shells`, `Fulfillment Drafts (Demand/Move/Supply)`, `Catalog Item CRUD`, `Label Template Constructor`, `Dashboard Report Pages`, `Catalog Groups`, `Production Orders`, `Subscription Billing Engine`, `Employee Access & Memberships`, `Document Detail Pages`, `Client Contacts & Addresses`, `Reports (ABC/Cost)`, `Sidebar Shell & Layout`, `Sales Channels & Permissions`, `Retail Checkout (POS)`, `Catalog Bundles`, `Cash Orders & Draft Documents`, `Purchase Invoices (InvoiceIn)`, `Platform Admin Pages`, `Auth Login/Register`, `Automation Scenarios`, `Catalog Print Section`, `Audit Log`, `Command`, `Vault`, `Platform Admins`, `Comments`, `Invoice Payments`, `Popover`, `Attachments`, `Custom Roles`, `Profile`, `Reports`, `Api Registry`, `Admin Auth`, `Atol Provider`, `Document Statuses`, `Projects`, `Units`, `Api Rate Limit`, `Crypto`, `Api Keys`, `Employees`, `Picking Waves`, `Platform Roles`, `Retail Shifts`, `Stock Movements`, `Tech Cards`, `Groups`, `Platform Feature Catalog`, `Platform Subscriptions`, `Webhooks`, `Platform Subscription Plans`, `Processing Stages`, `Proxy`, `Exchange Rates`, `Price Types`, `Custom Fields`, `Audit Entity Labels`, `Expense Items`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Why does `react` connect `Platform Admin Inline Forms` to `Fulfillment & Packaging UI`, `Data Table UI Components`, `Excel/CSV Catalog Import`, `Catalog Pricing & Contracts`, `Discounts & Feature Catalog`, `Card UI & Page Shells`, `Fulfillment Drafts (Demand/Move/Supply)`, `Sidebar Nav & Payments Subnav`, `Label Template Constructor`, `Employee Access & Memberships`, `Sidebar Shell & Layout`, `package.json Dependencies (A)`, `Print Menu & Org Switcher`, `Charts (Recharts)`, `Cash Orders & Draft Documents`, `Catalog Print Section`, `Warehouse Movement Forms`, `Kassa POS Screen`, `Command`, `Comments`, `Popover`, `Attachments`, `Permissions Matrix Editor`, `Orders Subnav`, `Breadcrumb`, `Scenarios Manager`, `Picking Waves`, `Platform Feature Catalog`, `Sales Channel Form`, `Print Dialog`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _739 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Legal Entities Actions` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Fulfillment & Packaging UI` be split into smaller, more focused modules?**
  _Cohesion score 0.05948295584534431 - nodes in this community are weakly interconnected._
- **Should `Data Table UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.09460105112279026 - nodes in this community are weakly interconnected._