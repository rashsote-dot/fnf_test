function onEvent(name, value1, value2)
	if name == 'screens' then
		if value1 == '0' then
			setProperty('sc1.alpha', 0)
			setProperty('sc2.alpha', 0)
		elseif value1 == '1' then
			setProperty('sc1.alpha', 1)
			setProperty('sc2.alpha', 0)
		elseif value1 == '2' then
			setProperty('sc1.alpha', 0)
			setProperty('sc2.alpha', 1)
		end
	end
end