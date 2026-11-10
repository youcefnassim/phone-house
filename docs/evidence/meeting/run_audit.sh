#!/bin/bash
# Chunked per-control audit: 6 click combos x 3 route chunks + 12 render-only combos
cd /dev-server/docs/evidence/meeting
CH1="/,/pos,/cash,/stock/phones,/stock/accessories,/catalog,/customers"
CH2="/debts,/suppliers,/purchases,/transfers,/facility,/sav"
CH3="/expenses,/reports,/audit,/users,/settings,/auth"
i=0
for combo in "fr-DZ 1440x900 light" "fr-DZ 390x844 dark" "ar-DZ 1440x900 light" "ar-DZ 768x1024 dark" "ar-DZ 390x844 dark" "en 768x1024 light"; do
  set -- $combo
  for ch in 1 2 3; do
    eval "ROUTES=\$CH$ch"
    R="$ROUTES" python3 final_audit.py "$1" "$2" "$3" "/tmp/audit_${1}_${2}_${3}_c${ch}.csv" >> /tmp/audit_driver.log 2>&1
  done
done
for combo in "fr-DZ 768x1024 light" "fr-DZ 768x1024 dark" "fr-DZ 1440x900 dark" "fr-DZ 390x844 light" "ar-DZ 1440x900 dark" "ar-DZ 768x1024 light" "ar-DZ 390x844 light" "en 1440x900 light" "en 1440x900 dark" "en 768x1024 dark" "en 390x844 light" "en 390x844 dark"; do
  set -- $combo
  python3 final_audit.py "$1" "$2" "$3" "/tmp/audit_${1}_${2}_${3}_render.csv" render-only >> /tmp/audit_driver.log 2>&1
done
echo "AUDIT DRIVER DONE" >> /tmp/audit_driver.log
