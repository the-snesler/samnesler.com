import { useCallback, useState } from 'react';

import AssignScreen from './AssignScreen';
import CropScreen from './CropScreen';
import { IMAGE_TOO_LARGE_MESSAGE, ImageTooLargeError, preprocessReceiptImage } from './imagePreprocessing';
import SummaryScreen from './SummaryScreen';
import UploadScreen from './UploadScreen';
import { FONT_LINK, SCREEN, palette } from './styles';
import type { BillItem, ParsedReceipt, Person, TipTaxMode } from './types';
import { buildInitialStateFromParsedReceipt, computeSummary } from './utils';

const PARSE_FAILURE_MESSAGE = "Couldn't parse that receipt. Try a clearer photo.";

export default function BillSplitter() {
  const [screen, setScreen] = useState<(typeof SCREEN)[keyof typeof SCREEN]>(SCREEN.UPLOAD);
  const [items, setItems] = useState<BillItem[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [tipMode, setTipMode] = useState<TipTaxMode>('percent');
  const [tipValue, setTipValue] = useState(20);
  const [taxMode, setTaxMode] = useState<TipTaxMode>('percent');
  const [taxValue, setTaxValue] = useState(5.5);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignModal, setAssignModal] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);

  const handleParseImage = useCallback(async (file: File) => {
    setParsing(true);
    setError(null);

    try {
      const preparedFile = await preprocessReceiptImage(file);
      const formData = new FormData();
      formData.append('image', preparedFile, preparedFile.name);

      const response = await fetch('/api/bill-splitter', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const parsed = (await response.json()) as ParsedReceipt;
      const { items, people, subtotal, taxMode, taxValue } = buildInitialStateFromParsedReceipt(parsed);

      setItems(items);
      setPeople(people);
      setTaxMode(taxMode);
      setTaxValue(taxValue);
      if (subtotal <= 0) {
        setError(PARSE_FAILURE_MESSAGE);
        setScreen(SCREEN.UPLOAD);
        setPendingImage(null);
        return;
      }
      setPendingImage(null);
      setScreen(SCREEN.ASSIGN);
    } catch (err) {
      console.error(err);
      if (err instanceof ImageTooLargeError) {
        setError(IMAGE_TOO_LARGE_MESSAGE);
      } else {
        setError(PARSE_FAILURE_MESSAGE);
      }
      setScreen(SCREEN.UPLOAD);
      setPendingImage(null);
    } finally {
      setParsing(false);
    }
  }, []);

  const handleUploadImage = useCallback((file: File) => {
    setError(null);
    setPendingImage(file);
    setScreen(SCREEN.CROP);
  }, []);

  const summary = computeSummary({
    items,
    people,
    taxMode,
    taxValue,
    tipMode,
    tipValue
  });

  return (
    <>
      <link href={FONT_LINK} rel="stylesheet" />
      <div
        className="relative mx-auto min-h-screen max-w-[480px]"
        style={{
          fontFamily: "'DM Sans', sans-serif",
          background: palette.bg,
          color: palette.text
        }}
      >
        {screen === SCREEN.UPLOAD && <UploadScreen onImage={handleUploadImage} parsing={false} error={error} />}

        {screen === SCREEN.CROP && pendingImage && (
          <CropScreen
            file={pendingImage}
            parsing={parsing}
            onBack={() => {
              if (!parsing) {
                setPendingImage(null);
                setScreen(SCREEN.UPLOAD);
              }
            }}
            onSkip={async () => {
              await handleParseImage(pendingImage);
            }}
            onConfirmCrop={async croppedFile => {
              await handleParseImage(croppedFile);
            }}
          />
        )}

        {screen === SCREEN.ASSIGN && (
          <AssignScreen
            items={items}
            setItems={setItems}
            people={people}
            setPeople={setPeople}
            tipMode={tipMode}
            setTipMode={setTipMode}
            tipValue={tipValue}
            setTipValue={setTipValue}
            taxMode={taxMode}
            setTaxMode={setTaxMode}
            taxValue={taxValue}
            setTaxValue={setTaxValue}
            assignModal={assignModal}
            setAssignModal={setAssignModal}
            onDone={() => setScreen(SCREEN.SUMMARY)}
            onBack={() => {
              setPendingImage(null);
              setScreen(SCREEN.UPLOAD);
            }}
          />
        )}

        {screen === SCREEN.SUMMARY && <SummaryScreen summary={summary} onBack={() => setScreen(SCREEN.ASSIGN)} />}
      </div>
    </>
  );
}
