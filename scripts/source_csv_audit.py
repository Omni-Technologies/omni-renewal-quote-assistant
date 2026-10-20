#!/usr/bin/env python3
"""Independent source CSV audit. Uses only csv/json/decimal; never imports the application."""
import csv, hashlib, json, re
from collections import defaultdict, Counter
from datetime import datetime
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Time Sheets Oct 19, 2026 02 57.csv"
OUTPUT = ROOT / "audit" / "source-verification.json"

def main():
    raw = SOURCE.read_bytes()
    with SOURCE.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    grouped = defaultdict(list)
    for line, row in enumerate(rows, 2):
        row["source_row"] = line
        row["duration_decimal"] = Decimal(row["Duration"])
        grouped[(row["Project Number"], row["Project Name"])].append(row)
    projects = []
    for (number, name), rs in sorted(grouped.items()):
        approved = [r for r in rs if r["Approved"] == "True"]
        projects.append({"project_number": number, "project_name": name,
            "source_rows": [r["source_row"] for r in rs],
            "approved_source_rows": [r["source_row"] for r in approved],
            "physical_row_count": len(rs), "approved_row_count": len(approved),
            "approved_hours": str(sum((r["duration_decimal"] for r in approved), Decimal(0))),
            "unapproved_row_count": len(rs)-len(approved),
            "unapproved_hours": str(sum((r["duration_decimal"] for r in rs if r["Approved"] != "True"), Decimal(0))),
            "clients": sorted({r["Client Name"] for r in rs}),
            "resources": sorted({r["Resource"] for r in approved}),
            "dates": sorted({r["Date"] for r in rs}, key=lambda d: datetime.strptime(d, "%m/%d/%Y")),
            "rows": [{k:r[k] for k in ("source_row","Approved","Entity","Date","Resource","Client Name","Project Name","Project Number","Name","Number","Duration")} for r in rs]})
    annual_names=defaultdict(set); number_names=defaultdict(set)
    for n,name in grouped: annual_names[name].add(n); number_names[n].add(name)
    duplicate_names={name:sorted(nums) for name,nums in annual_names.items() if len(nums)>1}
    number_conflicts={n:sorted(names) for n,names in number_names.items() if len(names)>1}
    all_rows=[r for rs in grouped.values() for r in rs]
    approved=[r for r in all_rows if r["Approved"]=="True"]
    parsed_dates=[datetime.strptime(r["Date"], "%m/%d/%Y") for r in all_rows]
    terms=Counter("semi_annual" if "semi" in r["Project Name"].lower() else "annual" if "annual" in r["Project Name"].lower() else "neither" for r in all_rows)
    noninspection=[r for r in all_rows if re.search(r"battery|replace|replacement|testing|test(?:ing)? & recording|troubleshoot|investigate|deficien|discrepanc",r["Project Name"],re.I) and not re.search(r"inspection|inspect",r["Project Name"],re.I)]
    bykey={(x["project_number"],x["project_name"]):x for x in projects}
    examples={}
    for label,key in {
      "multi_inspector_annual_2026":("25-1179","I&T - FA Decade Properties Annual Fire Alarm Inspection 2 of 3 2026"),
      "three_year_site_annual_2022":("22-0256","I&T - FA St. Mary's Hospital Annual Fire Alarm Inspection 2022"),
      "three_year_site_annual_2023":("23-1097","I&T - FA St. Mary's Hospital Annual Fire Alarm Inspection 2023"),
      "three_year_site_annual_2024":("24-1501","I&T - FA St. Mary's Hospital Annual Fire Alarm Inspection 2024 1 of 3"),
      "same_client_annual":("25-0539","I&T- FA Cedar Crest Existing Campus/RCAC Annual Fire Alarm Inspection 2026 2 of 3"),
      "same_client_semi_annual":("25-2043","I&T- FA Cedar Crest Existing Campus/RCAC Semi Annual Fire Alarm Inspection 2026 3 of 3"),
      "svc_deficiency_multi_inspector":("23-1037","SVC - FA I&T SP Healthcare Annual FA Inspection 2023 Deficiencies"),
      "multiple_location_outpatient":("23-0063","SVC - FA I&T St. Mary's Outpatient Annual FA Inspection 2022 Deficiencies"),
      "multiple_location_hospital":("23-0064","SVC - FA I&T St. Mary's Hospital Annual FA Inspection 2022 Battery Replacement"),
      "mixed_annual_semi_frequency":("22-0253","I&T - FA/INT QBE Sun Prairie Annual & Semi-Annual Fire Alarm/Security Inspection 2022"),
    }.items():
      x=bykey.get(key)
      if x: examples[label]={k:x[k] for k in ("project_number","project_name","physical_row_count","approved_row_count","approved_hours","approved_source_rows","resources","dates")}
    semi_long=[]
    for x in projects:
      if "semi" not in x["project_name"].lower(): continue
      ds=sorted({datetime.strptime(r["Date"],"%m/%d/%Y") for r in all_rows if r["Project Number"]==x["project_number"] and r["Project Name"]==x["project_name"] and r["Approved"]=="True"})
      if len(ds)>1 and (ds[-1]-ds[0]).days>90:
        gaps=[(ds[i+1]-ds[i]).days for i in range(len(ds)-1)]
        if max(gaps)>60:
          semi_long.append({"project_number":x["project_number"],"project_name":x["project_name"],"approved_distinct_dates":len(ds),"first_date":ds[0].strftime("%m/%d/%Y"),"last_date":ds[-1].strftime("%m/%d/%Y"),"span_days":(ds[-1]-ds[0]).days,"largest_interdate_gap_days":max(gaps),"approved_row_count":x["approved_row_count"],"approved_hours":x["approved_hours"]})
    payload={"method":"Independent Python csv + decimal source audit; no application imports", "source_file":SOURCE.name,"source_sha256":hashlib.sha256(raw).hexdigest(),"physical_data_rows":len(all_rows),"approved_rows":len(approved),"unapproved_rows":len(all_rows)-len(approved),"approved_hours":str(sum((r["duration_decimal"] for r in approved),Decimal(0))),"unapproved_hours":str(sum((r["duration_decimal"] for r in all_rows if r["Approved"]!="True"),Decimal(0))),"distinct_project_numbers":len(number_names),"distinct_number_name_pairs":len(grouped),"distinct_clients":len({r["Client Name"] for r in all_rows}),"distinct_resources":len({r["Resource"] for r in all_rows}),"date_min":min(parsed_dates).strftime("%m/%d/%Y"),"date_max":max(parsed_dates).strftime("%m/%d/%Y"),"name_to_multiple_numbers":duplicate_names,"number_to_multiple_names":number_conflicts,"literal_frequency_term_row_counts":dict(terms),"review_examples":examples,"semi_annual_projects_over_90_day_span_and_60_day_gap":semi_long,"task_anomaly_candidate_rows_without_inspection_term":[{k:r[k] for k in ("source_row","Approved","Date","Resource","Client Name","Project Name","Project Number","Duration")} for r in noninspection],"projects":projects}
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps(payload,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(f"Wrote {OUTPUT}: {len(projects)} exact project groups, {len(all_rows)} rows")
if __name__ == "__main__": main()
