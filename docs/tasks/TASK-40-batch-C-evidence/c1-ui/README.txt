TASK-40 Dot C1 — bang chung UI that (ChatPanel), 08/11/2026
=============================================================

Cach tao:
  1. npm run dev            (rspack dev server, http://localhost:8080 — build DEV, co __chiliTest)
  2. node docs/tasks/TASK-40-batch-C-evidence/c1_ui_states.mjs
     (headful Chrome CDP 9233; that panel + full page moi trang thai)

Pham vi bang chung — noi tha that:
- Du lieu duoc day qua __chiliTest.governance (mat na dev/preview, nhu __chiliTest hien
  tai cua PDF scenario runner). CHINH cua hang luu tru (evidenceStore) + CHINH component
  ChatPanel + CSS that — khong phai mock render.
- KHONG phai vong LLM that (guider §11.11 thu 3 — thuoc Dot D): trigger la lenh script,
  khong phai goi propose_task_plan tu model.
- Production build KHONG tu dang ky runner nao → status that van la deferred cho toi khi
  Reviewer nghiem thu C1 (quyet dinh co tinh bao toan tran).
- Anh *_panel.png = card luc zoom 0.6 de vua khung (badge nam duoi fold cua panel);
  anh *_full.png = toan man hinh 1500x1400. Chu trong png do OCR nho co the lem,
  c1_ui_states.json (cardText, rows, statusLine) la ban may-doc chinh xac nhat.

Trang thai quay duoc (ca ba bang ca + anh + JSON):
  01_mixed_pass_fail_unknown  ✅ dimension (100x50x20, dung sai 2/2/2)
                              ❌ position (Y do 25mm, mong 500mm, lech -475mm)
                              ❓ dimension thieu dung sai → unknown (khong bao gio pass im lang)
                              badge: ⏳ CHƯA HOÀN TẤT — còn 2/3 tiêu chí bắt buộc chưa đạt
  02_stale_after_invalidate   invalidateEvidenceForNodeIds sau do sua hinh → 3 dong
                              "invalidated … (bằng chứng cũ 17:31:06)", pass 0/fail 0/unknown 3,
                              badge ⏳ còn 3/3 — pass cu KHONG duoc dung lai.
  03_all_required_pass        2/2 required pass → badge
                              ✔ HOÀN TẤT — mọi tiêu chí bắt buộc đều pass với bằng chứng hợp lệ
  Status bar that moi buoc (statusLine trong JSON): "🔎 Đợt C: hậu kiểm tiêu chí đang bật
  (2 bộ kiểm) · chưa áp bảng dung sai · …"

Windows: CHUA duoc kiem tra (khong co moi truong).
