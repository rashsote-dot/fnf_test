local restoredMiss = getModSetting("RMS")

function noteMiss()
	if restoredMiss then
		missSound = string.format('missnote%i', math.random(1, 3))
		playSound(missSound, getModSetting("MSV")/10)
	end
end