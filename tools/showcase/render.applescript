on run argv
  set inPath to item 1 of argv
  set outPath to item 2 of argv
  set outHFS to (POSIX file outPath) as string
  with timeout of 300 seconds
    tell application "Microsoft PowerPoint"
      if (count of presentations) is 0 then open (POSIX file inPath)
      delay 2
      save active presentation in outHFS as save as PDF
      delay 1
      close active presentation saving no
    end tell
  end timeout
end run
