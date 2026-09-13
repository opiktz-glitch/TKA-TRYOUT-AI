import {
  PANDUAN_SOAL_JUDUL,
  PANDUAN_SOAL_SUMBER,
  PANDUAN_SOAL_SECTIONS,
} from "../data/panduanSoal";

// =====================================================
// MODAL PANDUAN / KISI-KISI PENULISAN SOAL
// =====================================================
// Muncul DI ATAS form Tambah Soal (manual) atau Tambah
// Soal AI tanpa menutup form yang sedang dibuka, supaya
// guru bisa membaca panduan sambil tetap mengisi form.

function PanduanSoalModal({ onClose }) {
  return (
    <div
      className="modal-overlay panduan-soal-overlay"
      onClick={onClose}
    >
      <div
        className="modal panduan-soal-modal"
        style={{ width: "700px", maxWidth: "94vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>{PANDUAN_SOAL_JUDUL}</h2>
            <p>{PANDUAN_SOAL_SUMBER}</p>
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="panduan-soal-body">
          {PANDUAN_SOAL_SECTIONS.map((section, index) => {
            const titleMatch = section.title.match(
              /^(\d+\.)\s*(.*)$/
            );

            const numberLabel = titleMatch
              ? titleMatch[1]
              : null;

            const titleText = titleMatch
              ? titleMatch[2]
              : section.title;

            return (
              <div key={index} className="panduan-soal-section">
                <h4 className="panduan-soal-title">
                  {numberLabel && (
                    <span className="panduan-soal-title-number">
                      {numberLabel}
                    </span>
                  )}
                  <span>{titleText}</span>
                </h4>

                <div className="panduan-soal-content">
                  {section.paragraphs &&
                    section.paragraphs.map((paragraph, pIndex) => (
                      <p key={pIndex}>{paragraph}</p>
                    ))}

                  {section.items && (
                    <ul>
                      {section.items.map((item, iIndex) => (
                        <li key={iIndex}>
                          {typeof item === "string" ? (
                            item
                          ) : (
                            <>
                              <strong>{item.label}:</strong> {item.text}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="primary-button"
            onClick={onClose}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

export default PanduanSoalModal;
