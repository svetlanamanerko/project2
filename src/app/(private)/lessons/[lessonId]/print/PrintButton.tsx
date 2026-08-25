'use client';

import { Printer } from 'lucide-react';
import styles from './print.module.css';

export function PrintButton() {
  return <button className={styles.printButton} type="button" onClick={() => window.print()}>
    <Printer size={16}/> Печать / сохранить PDF
  </button>;
}
